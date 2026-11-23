import { parse } from '@babel/parser';
import _traverse from '@babel/traverse';
import _generate from '@babel/generator';
import * as t from '@babel/types';

// CJS/ESM interop — Next.js compiles these to CJS default-wrapped
const traverse = (_traverse as unknown as { default: typeof _traverse }).default ?? _traverse;
const generate = (_generate as unknown as { default: typeof _generate }).default ?? _generate;

// Modules merged into a single cap-net role
const NET_GROUP = new Set(['http', 'https', 'net']);

// All dangerous modules (each gets its own cap file, except NET_GROUP → cap-net)
const DANGEROUS = new Set(['os', 'fs', 'child_process', 'http', 'https', 'net']);

export type CapFile = { role: string; code: string; requires: string[] };

export type SplitAnalysis = {
  found: string[];      // capability roles detected
  safe: string[];       // safe builtins kept in entrypoint
  capFiles: { role: string; lines: number }[];
  entrypointLines: number;
};

export type SplitResult = {
  caps: CapFile[];
  entrypoint: string;
  analysis: SplitAnalysis;
};

function moduleToRole(mod: string): string {
  if (NET_GROUP.has(mod)) return 'cap-net';
  return `cap-${mod.replace('/', '-')}`;
}

function capVarName(role: string): string {
  return `__${role.replace(/-/g, '_')}`;
}

/**
 * Collect which dangerous bindings a statement references.
 * Returns set of ROLES (not raw module names).
 */
function stmtCapRoles(
  stmt: t.Statement,
  bindingToRole: Map<string, string>,
): Set<string> {
  const refs = new Set<string>();
  traverse(t.file(t.program([stmt])), {
    Identifier(path) {
      const role = bindingToRole.get(path.node.name);
      if (role) refs.add(role);
    },
    noScope: true,
  });
  return refs;
}

/**
 * Collect which safe modules a statement references.
 */
function stmtSafeRefs(
  stmt: t.Statement,
  safeBindings: Map<string, string>,
): Set<string> {
  const refs = new Set<string>();
  traverse(t.file(t.program([stmt])), {
    Identifier(path) {
      const mod = safeBindings.get(path.node.name);
      if (mod) refs.add(mod);
    },
    noScope: true,
  });
  return refs;
}

export function splitPayload(source: string): SplitResult {
  const ast = parse(source, { sourceType: 'script', plugins: [] });

  // Unwrap webpack IIFE wrapper: (() => { ... })()
  let body = ast.program.body;
  if (body.length === 1 && t.isExpressionStatement(body[0])) {
    const expr = body[0].expression;
    if (
      t.isCallExpression(expr) &&
      (t.isArrowFunctionExpression(expr.callee) || t.isFunctionExpression(expr.callee)) &&
      t.isBlockStatement(expr.callee.body)
    ) {
      body = expr.callee.body.body;
    }
  }

  // ── 1. Collect require bindings ──
  const bindingToModule = new Map<string, string>();       // varName → raw module
  const bindingToRole = new Map<string, string>();         // varName → role
  const destructuredToModule = new Map<string, string>();
  const destructuredToRole = new Map<string, string>();
  const safeBindings = new Map<string, string>();          // varName → module (safe ones)
  const requireIdxs = new Set<number>();                   // body indices of ALL require stmts

  // Track per-module binding name (for cap file generation)
  const moduleBindingName = new Map<string, string>();     // module → binding var name

  for (let i = 0; i < body.length; i++) {
    const stmt = body[i];
    if (!t.isVariableDeclaration(stmt)) continue;

    for (const decl of stmt.declarations) {
      if (!t.isCallExpression(decl.init)) continue;
      if (!t.isIdentifier(decl.init.callee, { name: 'require' })) continue;
      if (decl.init.arguments.length !== 1 || !t.isStringLiteral(decl.init.arguments[0])) continue;

      const modName = decl.init.arguments[0].value;

      if (DANGEROUS.has(modName)) {
        requireIdxs.add(i);
        const role = moduleToRole(modName);

        if (t.isIdentifier(decl.id)) {
          bindingToModule.set(decl.id.name, modName);
          bindingToRole.set(decl.id.name, role);
          moduleBindingName.set(modName, decl.id.name);
        } else if (t.isObjectPattern(decl.id)) {
          for (const prop of decl.id.properties) {
            if (t.isObjectProperty(prop) && t.isIdentifier(prop.value)) {
              destructuredToModule.set(prop.value.name, modName);
              destructuredToRole.set(prop.value.name, role);
            }
          }
        }
      } else {
        requireIdxs.add(i);
        if (t.isIdentifier(decl.id)) {
          safeBindings.set(decl.id.name, modName);
        }
      }
    }
  }

  // Merge all dangerous bindings into one role lookup
  const allBindingToRole = new Map([...bindingToRole, ...destructuredToRole]);

  // ── 2. Tag each non-require statement ──
  type TaggedStmt = { idx: number; stmt: t.Statement; roles: Set<string>; safeRefs: Set<string> };
  const tagged: TaggedStmt[] = [];

  for (let i = 0; i < body.length; i++) {
    if (requireIdxs.has(i)) continue;
    const stmt = body[i];
    const roles = stmtCapRoles(stmt, allBindingToRole);
    const safeRefs = stmtSafeRefs(stmt, safeBindings);
    tagged.push({ idx: i, stmt, roles, safeRefs });
  }

  // ── 3. Build capability groups ──
  const roleSet = new Set<string>();
  for (const role of bindingToRole.values()) roleSet.add(role);
  for (const role of destructuredToRole.values()) roleSet.add(role);
  const roles = [...roleSet];

  const safeModulesUsed = [...new Set(safeBindings.values())];

  // ── 4. Determine extracted statements per role ──
  // A statement is extracted to a cap file if it references exactly one role
  const extractedByRole = new Map<string, TaggedStmt[]>();
  for (const role of roles) extractedByRole.set(role, []);
  const extractedIdxs = new Set<number>();

  for (const t of tagged) {
    if (t.roles.size === 1) {
      const role = [...t.roles][0];
      extractedByRole.get(role)!.push(t);
      extractedIdxs.add(t.idx);
    }
  }

  // Track which function names were extracted to which role
  const extractedFuncToRole = new Map<string, string>();
  for (const [role, stmts] of extractedByRole) {
    for (const { stmt } of stmts) {
      if (t.isFunctionDeclaration(stmt) && stmt.id) {
        extractedFuncToRole.set(stmt.id.name, role);
      }
    }
  }

  // ── 5. Generate capability files ──
  const caps: CapFile[] = [];

  for (const role of roles) {
    const extracted = extractedByRole.get(role)!;

    // Which raw modules belong to this role
    const roleMods: string[] = [];
    for (const [, mod] of bindingToModule) {
      if (moduleToRole(mod) === role && !roleMods.includes(mod)) roleMods.push(mod);
    }
    for (const [, mod] of destructuredToModule) {
      if (moduleToRole(mod) === role && !roleMods.includes(mod)) roleMods.push(mod);
    }

    // Which safe modules the extracted statements reference
    const neededSafe = new Set<string>();
    for (const { safeRefs } of extracted) {
      for (const s of safeRefs) neededSafe.add(s);
    }

    // Which API methods multi-ref statements need from this role
    const apiMethods = new Set<string>();
    for (const { stmt, roles: stmtRoles } of tagged) {
      if (stmtRoles.size <= 1) continue;
      if (!stmtRoles.has(role)) continue;

      // Collect member expression calls: os.hostname() → hostname
      traverse(t.file(t.program([stmt])), {
        MemberExpression(path) {
          if (t.isIdentifier(path.node.object) && t.isIdentifier(path.node.property)) {
            if (bindingToRole.get(path.node.object.name) === role) {
              apiMethods.add(path.node.property.name);
            }
          }
        },
        noScope: true,
      });
    }
    // Also check for calls to extracted functions from entrypoint statements
    // (these will be rewritten to cap.func() calls)

    // Build cap file
    const lines: string[] = [];
    lines.push(`'use strict';`);

    // Requires: dangerous modules for this role
    for (const mod of roleMods) {
      const binding = moduleBindingName.get(mod);
      if (binding) {
        lines.push(`const ${binding} = require('${mod}');`);
      }
    }

    // Requires: safe modules needed by extracted statements
    for (const safeMod of neededSafe) {
      const binding = [...safeBindings.entries()].find(([, m]) => m === safeMod)?.[0];
      if (binding) lines.push(`const ${binding} = require('${safeMod}');`);
    }

    // Extracted statements
    const exportNames: string[] = [];
    for (const { stmt } of extracted) {
      lines.push('');
      lines.push(generate(stmt).code);
      if (t.isFunctionDeclaration(stmt) && stmt.id) {
        exportNames.push(stmt.id.name);
      }
    }

    // API wrappers for multi-ref usage
    if (apiMethods.size > 0) {
      lines.push('');
      for (const method of apiMethods) {
        if (exportNames.includes(method)) continue;
        // Find which raw module binding this method belongs to
        const binding = [...bindingToModule.entries()]
          .find(([name, mod]) => moduleToRole(mod) === role && bindingToRole.get(name) === role)?.[0];
        if (binding) {
          lines.push(`function ${method}(...args) { return ${binding}.${method}(...args); }`);
          exportNames.push(method);
        }
      }
    }

    // Export raw module references too (for bare identifier rewrites in entrypoint)
    for (const mod of roleMods) {
      const binding = moduleBindingName.get(mod);
      if (binding && !exportNames.includes(binding)) {
        exportNames.push(binding);
      }
    }

    lines.push('');
    lines.push(`module.exports = { ${exportNames.join(', ')} };`);

    caps.push({ role, code: lines.join('\n'), requires: roleMods });
  }

  // ── 6. Generate entrypoint ──
  const entryLines: string[] = [];
  entryLines.push(`'use strict';`);

  // Safe requires
  for (const [binding, mod] of safeBindings) {
    entryLines.push(`const ${binding} = require('${mod}');`);
  }

  // Cap package requires
  for (const role of roles) {
    const varName = capVarName(role);
    const placeholder = rolePlaceholder(role);
    entryLines.push(`const ${varName} = require('${placeholder}');`);
  }
  entryLines.push('');

  // Non-extracted statements, with rewrites
  for (const { idx, stmt, roles: stmtRoles } of tagged) {
    if (extractedIdxs.has(idx)) continue;

    // Check if this statement references any extracted functions
    const needsRewrite = stmtRoles.size > 0 || stmtCallsExtracted(stmt, extractedFuncToRole);

    if (!needsRewrite) {
      entryLines.push(generate(stmt).code);
    } else {
      const rewritten = rewriteForEntrypoint(stmt, bindingToRole, destructuredToRole, extractedFuncToRole);
      entryLines.push(generate(rewritten).code);
    }
  }

  const entrypoint = entryLines.join('\n');

  return {
    caps,
    entrypoint,
    analysis: {
      found: roles,
      safe: safeModulesUsed,
      capFiles: caps.map(c => ({ role: c.role, lines: c.code.split('\n').length })),
      entrypointLines: entrypoint.split('\n').length,
    },
  };
}

/**
 * Rewrite a statement for the entrypoint:
 * - os.hostname() → __cap_os.hostname()
 * - bare `https` → __cap_net.https
 * - getInterfaces() → __cap_os.getInterfaces() (extracted function)
 */
function rewriteForEntrypoint(
  stmt: t.Statement,
  bindingToRole: Map<string, string>,
  destructuredToRole: Map<string, string>,
  extractedFuncToRole: Map<string, string>,
): t.Statement {
  const cloned = t.cloneNode(stmt, true);
  traverse(t.file(t.program([cloned])), {
    MemberExpression(path) {
      if (t.isIdentifier(path.node.object)) {
        const role = bindingToRole.get(path.node.object.name);
        if (role) {
          path.node.object = t.identifier(capVarName(role));
        }
      }
    },
    Identifier(path) {
      // Skip if this identifier is already handled as a MemberExpression object
      if (path.parent && t.isMemberExpression(path.parent) && path.parent.object === path.node) return;
      // Skip if it's a property key
      if (path.parent && t.isMemberExpression(path.parent) && path.parent.property === path.node && !path.parent.computed) return;
      // Skip if it's a function/variable declaration name
      if (path.parent && (t.isFunctionDeclaration(path.parent) || t.isVariableDeclarator(path.parent)) && (path.parent as any).id === path.node) return;
      // Skip object property keys
      if (path.parent && t.isObjectProperty(path.parent) && path.parent.key === path.node) return;

      const name = path.node.name;

      // Bare dangerous binding reference (e.g. `https` in a ternary)
      const role = bindingToRole.get(name);
      if (role) {
        path.replaceWith(t.memberExpression(
          t.identifier(capVarName(role)),
          t.identifier(name),
        ));
        path.skip();
        return;
      }

      // Destructured binding reference
      const dRole = destructuredToRole.get(name);
      if (dRole) {
        path.replaceWith(t.memberExpression(
          t.identifier(capVarName(dRole)),
          t.identifier(name),
        ));
        path.skip();
        return;
      }
    },
    CallExpression(path) {
      // Rewrite calls to extracted functions: getInterfaces() → __cap_os.getInterfaces()
      if (t.isIdentifier(path.node.callee)) {
        const role = extractedFuncToRole.get(path.node.callee.name);
        if (role) {
          path.node.callee = t.memberExpression(
            t.identifier(capVarName(role)),
            t.identifier(path.node.callee.name),
          );
        }
      }
    },
    noScope: true,
  });
  return cloned;
}

function stmtCallsExtracted(stmt: t.Statement, extractedFuncToRole: Map<string, string>): boolean {
  let found = false;
  traverse(t.file(t.program([stmt])), {
    CallExpression(path) {
      if (t.isIdentifier(path.node.callee) && extractedFuncToRole.has(path.node.callee.name)) {
        found = true;
        path.stop();
      }
    },
    noScope: true,
  });
  return found;
}

function rolePlaceholder(role: string): string {
  return `__${role.toUpperCase().replace(/-/g, '_')}__`;
}

export function capPlaceholders(found: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const role of found) {
    map[role] = rolePlaceholder(role);
  }
  return map;
}
