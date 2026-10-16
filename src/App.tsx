import { useState } from 'react';
import { EditorRuntime } from './features/editor/components/EditorRuntime';

function App() {
  const [sourcePath, setSourcePath] = useState<string | null>(null);

  return <EditorRuntime sourcePath={sourcePath} onSourcePathChange={setSourcePath} />;
}

export default App;
