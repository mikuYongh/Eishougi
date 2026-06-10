export * from "./prompts/PromptList";
export * from "./workflows/WorkflowList";
export * from "./generate/Generate";
export * from "./generate/VideoGenerate";
export * from "./tools/Tagger";
export * from "./gallery/Gallery";
export * from "./history/History";
export { Settings } from "./Settings";

// These three are still placeholders since they are sub-pages (edit/detail), not main menu items.
export function PromptEdit()    { return <div className="text-white/50 p-10 text-center">PromptEdit 页面开发中...</div>; }
export function PromptDetail()  { return <div className="text-white/50 p-10 text-center">PromptDetail 页面开发中...</div>; }
export function WorkflowEdit()  { return <div className="text-white/50 p-10 text-center">WorkflowEdit 页面开发中...</div>; }
