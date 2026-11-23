'use client';
import { useState, useRef, useCallback } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';

const TS_STARTER = `import { sendBeacon, startHeartbeat, gatherSystemInfo } from '@dolus/dev';

const info = gatherSystemInfo();
await sendBeacon({ custom: { myField: 'value' } });
startHeartbeat();
`;

const JS_STARTER = '';

export default function PayloadEditor({
  defaultValue,
  defaultLang,
  dts,
  namePrefix,
}: {
  defaultValue?: string;
  defaultLang?: 'js' | 'ts';
  dts: string;
  namePrefix?: string;
}) {
  const [lang, setLang] = useState<'js' | 'ts'>(defaultLang ?? 'ts');
  const editorRef = useRef<any>(null);
  const prefix = namePrefix ?? '';

  const handleMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
      target: monaco.languages.typescript.ScriptTarget.ES2022,
      module: monaco.languages.typescript.ModuleKind.CommonJS,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      allowJs: true,
      esModuleInterop: true,
    });
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      dts,
      'file:///node_modules/@dolus/dev/index.d.ts',
    );
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare module '@dolus/dev' { export * from 'file:///node_modules/@dolus/dev/index'; }`,
      'file:///node_modules/@dolus/dev/module.d.ts',
    );
  }, [dts]);

  const switchLang = (newLang: 'js' | 'ts') => {
    setLang(newLang);
  };

  const value = defaultValue ?? (lang === 'ts' ? TS_STARTER : JS_STARTER);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => switchLang('ts')}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${lang === 'ts' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          TypeScript
        </button>
        <button
          type="button"
          onClick={() => switchLang('js')}
          className={`px-3 py-1 text-xs rounded-md transition-colors ${lang === 'js' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
        >
          JavaScript
        </button>
        <span className="text-[11px] text-gray-600 ml-2">
          {lang === 'ts' ? 'compiled via webpack before publish' : 'raw JS, no compilation'}
        </span>
      </div>
      <input type="hidden" name={`${prefix}lang`} value={lang} />
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <Editor
          height="500px"
          language={lang === 'ts' ? 'typescript' : 'javascript'}
          theme="vs-dark"
          defaultValue={value}
          onMount={handleMount}
          onChange={(val) => {
            const hidden = document.querySelector<HTMLInputElement>(`input[name="${prefix}install_js"]`);
            if (hidden) hidden.value = val ?? '';
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
            padding: { top: 12 },
          }}
        />
      </div>
      <input type="hidden" name={`${prefix}install_js`} defaultValue={value} />
    </div>
  );
}
