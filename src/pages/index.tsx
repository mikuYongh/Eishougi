export { Dashboard } from './Dashboard';
export { PromptList } from './prompts/PromptList';
export { PromptEdit } from './prompts/PromptEdit';
export { WorkflowList } from './workflows/WorkflowList';
export { WorkflowEdit } from './workflows/WorkflowEdit';
export { Generate } from './generate/Generate';
export { VideoGenerate } from './generate/VideoGenerate';
export { Tagger } from './tools/Tagger';
export { Gallery } from './gallery/Gallery';
export { History } from './history/History';
export { Settings } from './Settings';

// These two are still placeholders since they are sub-pages (edit/detail), not main menu items.
export function PromptDetail()  { return <div className="text-[var(--text-muted)] p-10 text-center">PromptDetail 页面开发中...</div>; }
