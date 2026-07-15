/**
 * ValidationReport — 工作流校验报告面板
 *
 * 展示能力契约匹配结果 + 结构化问题列表。
 * 每个能力行显示匹配状态，每个问题卡片提供修复建议。
 */
import { useState } from "react";
import {
  Check,
  X,
  AlertTriangle,
  AlertCircle,
  RefreshCw,
  Loader2,
  CheckCircle2,
  WifiOff,
  ChevronDown,
  ChevronRight,
  Wrench,
  Package,
  ArrowRight,
} from "lucide-react";
import type { ValidationReport as ValidationReportData, NodeIssue } from "../../services/comfyValidator";
import type { CapabilityMatch } from "../../services/workflowCapabilities";

interface ValidationReportProps {
  report: ValidationReportData | null;
  isValidating: boolean;
  onRevalidate: () => void;
  onFixIssue?: (issue: NodeIssue) => void;
  onLocateNode?: (nodeId: string) => void;
}

export function ValidationReport({ report, isValidating, onRevalidate, onFixIssue, onLocateNode }: ValidationReportProps) {
  const [showCapabilities, setShowCapabilities] = useState(true);
  const [showIssues, setShowIssues] = useState(true);

  // 整体状态
  const overallStatus = report?.status;
  const requiredMissing =
    report?.issues.filter((i) => i.status === "missing_node" || i.status === "no_output").length || 0;
  const invalidValues = report?.issues.filter((i) => i.status === "invalid_value").length || 0;
  const matchedCaps = report?.capabilities.filter((c) => c.matched).length || 0;
  const totalCaps = report?.capabilities.length || 0;
  const requiredCapsMissing = report?.capabilities.filter((c) => !c.matched && c.capability.required).length || 0;

  return (
    <div className="rounded-2xl border border-[var(--glass-border)] bg-[var(--bg-layer-1)]/60 backdrop-blur-xl overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* 顶部光带 */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-[var(--accent-1)]/60 to-transparent" />

      <div className="p-3">
        {/* 标题栏 */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div
              className={`w-6 h-6 rounded-lg flex items-center justify-center ${
                overallStatus === "valid"
                  ? "bg-emerald-500/20"
                  : overallStatus === "invalid"
                    ? "bg-red-500/20"
                    : overallStatus === "offline"
                      ? "bg-yellow-500/20"
                      : "bg-[var(--glass-bg)]"
              }`}
            >
              {isValidating ? (
                <Loader2 size={13} className="text-[var(--accent-1)] animate-spin" />
              ) : overallStatus === "valid" ? (
                <CheckCircle2 size={13} className="text-emerald-400" />
              ) : overallStatus === "offline" ? (
                <WifiOff size={13} className="text-yellow-400" />
              ) : overallStatus === "invalid" ? (
                <AlertCircle size={13} className="text-red-400" />
              ) : (
                <AlertCircle size={13} className="text-[var(--text-muted)]" />
              )}
            </div>
            <span className="text-[12px] font-bold text-[var(--text-primary)]">校验报告</span>
            {/* 状态摘要 */}
            {!isValidating && report && (
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded-md font-medium ${
                  overallStatus === "valid"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : overallStatus === "offline"
                      ? "bg-yellow-500/15 text-yellow-400"
                      : "bg-red-500/15 text-red-400"
                }`}
              >
                {overallStatus === "valid"
                  ? "通过"
                  : overallStatus === "offline"
                    ? "离线（仅本地检查）"
                    : `${requiredMissing + invalidValues} 个问题`}
              </span>
            )}
          </div>

          <button
            onClick={onRevalidate}
            disabled={isValidating}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-[var(--glass-bg)] border border-[var(--glass-border)] text-[var(--text-secondary)] hover:text-[var(--accent-1)] hover:bg-[var(--glass-bg-hover)] text-[10px] font-medium transition-all cursor-pointer disabled:opacity-50 disabled:cursor-wait"
          >
            <RefreshCw size={10} className={isValidating ? "animate-spin" : ""} />
            重新校验
          </button>
        </div>

        {/* 加载态 */}
        {isValidating && !report && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <Loader2 size={24} className="text-[var(--accent-1)] animate-spin" />
            <span className="text-[10px] text-[var(--text-muted)]">正在提交到 ComfyUI 校验...</span>
          </div>
        )}

        {/* 空状态 */}
        {!isValidating && !report && (
          <div className="flex flex-col items-center justify-center py-6 gap-2">
            <AlertCircle size={20} className="text-[var(--text-muted)]" />
            <span className="text-[10px] text-[var(--text-muted)]">点击「校验工作流」检查兼容性</span>
          </div>
        )}

        {/* 报告内容 */}
        {report && !isValidating && (
          <div className="max-h-[360px] min-h-0 overflow-y-auto custom-scrollbar pr-1 space-y-3">
            {/* ── 能力匹配区 ── */}
            {report.capabilities.length > 0 && (
              <div>
                <button
                  onClick={() => setShowCapabilities(!showCapabilities)}
                  className="flex items-center gap-1 mb-1.5 cursor-pointer w-full"
                >
                  {showCapabilities ? (
                    <ChevronDown size={11} className="text-[var(--text-muted)]" />
                  ) : (
                    <ChevronRight size={11} className="text-[var(--text-muted)]" />
                  )}
                  <span className="text-[9px] font-bold text-[var(--text-muted)] uppercase tracking-wider">
                    能力匹配
                  </span>
                  <span className="text-[9px] text-[var(--text-muted)] ml-auto">
                    {matchedCaps}/{totalCaps} 匹配
                  </span>
                </button>

                {showCapabilities && (
                  <div className="space-y-0.5">
                    {report.capabilities.map((cm) => (
                      <CapabilityRow key={cm.capability.id} match={cm} onLocate={onLocateNode} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── 问题列表区 ── */}
            {report.issues.length > 0 && (
              <div>
                <button
                  onClick={() => setShowIssues(!showIssues)}
                  className="flex items-center gap-1 mb-1.5 cursor-pointer w-full"
                >
                  {showIssues ? (
                    <ChevronDown size={11} className="text-red-400" />
                  ) : (
                    <ChevronRight size={11} className="text-red-400" />
                  )}
                  <span className="text-[9px] font-bold text-red-400 uppercase tracking-wider">问题</span>
                  <span className="text-[9px] text-red-400 ml-auto">{report.issues.length} 项</span>
                </button>

                {showIssues && (
                  <div className="space-y-1.5">
                    {report.issues.map((issue, i) => (
                      <IssueCard
                        key={`${issue.nodeId}-${i}`}
                        issue={issue}
                        onFix={onFixIssue}
                        onLocate={onLocateNode}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ── 全部通过 ── */}
            {report.issues.length === 0 && overallStatus === "valid" && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-[11px] font-bold text-emerald-400">工作流校验通过</p>
                  <p className="text-[9px] text-[var(--text-muted)]">
                    所有节点和模型可用，可以正常生成
                  </p>
                </div>
              </div>
            )}

            {/* ── 缺少必需能力 ── */}
            {requiredCapsMissing > 0 && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-red-500/5 border border-red-500/15">
                <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                <p className="text-[10px] text-red-400">
                  缺少 {requiredCapsMissing} 个必需能力，注入时将跳过这些参数
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── 能力行组件 ──────────────────────────────────────────

function CapabilityRow({ match, onLocate }: { match: CapabilityMatch; onLocate?: (id: string) => void }) {
  const { capability: cap, matched, nodeId } = match;
  const isRequired = cap.required;

  return (
    <div
      onClick={() => matched && nodeId && onLocate?.(nodeId)}
      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
        matched && nodeId ? "hover:bg-[var(--glass-bg-hover)] cursor-pointer" : ""
      }`}
    >
      {/* 状态圆点 */}
      <div
        className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
          matched
            ? "bg-emerald-500/20"
            : isRequired
              ? "bg-red-500/20"
              : "bg-[var(--glass-bg)]"
        }`}
      >
        {matched ? (
          <Check size={9} className="text-emerald-400" />
        ) : isRequired ? (
          <X size={9} className="text-red-400" />
        ) : (
          <span className="w-1 h-1 rounded-full bg-[var(--text-muted)]" />
        )}
      </div>

      {/* 标签 */}
      <span className={`text-[10px] font-medium flex-shrink-0 ${matched ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
        {cap.label}
      </span>
      {isRequired && (
        <span className="text-[8px] text-[var(--accent-1)] bg-[var(--accent-1)]/10 px-1 py-0.5 rounded">必需</span>
      )}

      {/* 节点信息 */}
      {matched && nodeId ? (
        <span className="text-[9px] font-mono text-[var(--text-muted)] truncate ml-auto">
          [{nodeId}]
        </span>
      ) : (
        <span className="text-[9px] text-[var(--text-muted)] ml-auto">
          {isRequired ? "未找到" : "无"}
        </span>
      )}
    </div>
  );
}

// ── 问题卡片组件 ──────────────────────────────────────────

function IssueCard({
  issue,
  onFix,
  onLocate,
}: {
  issue: NodeIssue;
  onFix?: (issue: NodeIssue) => void;
  onLocate?: (id: string) => void;
}) {
  const isMissing = issue.status === "missing_node" || issue.status === "no_output";
  const isInvalid = issue.status === "invalid_value";

  const cardStyle = isMissing
    ? "bg-red-500/[0.06] border-red-500/20"
    : isInvalid
      ? "bg-yellow-500/[0.06] border-yellow-500/20"
      : "bg-[var(--glass-bg)] border-[var(--glass-border)]";

  const iconBg = isMissing ? "bg-red-500/15" : isInvalid ? "bg-yellow-500/15" : "bg-[var(--glass-bg)]";
  const iconColor = isMissing ? "text-red-400" : isInvalid ? "text-yellow-400" : "text-[var(--text-muted)]";

  return (
    <div className={`rounded-xl border ${cardStyle} overflow-hidden animate-in fade-in zoom-in-95 duration-300`}>
      <div className="p-2.5">
        {/* 问题标题 */}
        <div className="flex items-start gap-2">
          <div className={`w-5 h-5 rounded-lg flex items-center justify-center flex-shrink-0 ${iconBg}`}>
            {isMissing ? (
              <Package size={11} className={iconColor} />
            ) : isInvalid ? (
              <AlertTriangle size={11} className={iconColor} />
            ) : (
              <AlertCircle size={11} className={iconColor} />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold text-[var(--text-primary)]">{issue.message}</p>
            {issue.nodeId && (
              <button
                onClick={() => onLocate?.(issue.nodeId)}
                className="text-[9px] font-mono text-[var(--text-muted)] hover:text-[var(--accent-1)] transition-colors cursor-pointer"
              >
                节点 [{issue.nodeId}] {issue.classType ? `· ${issue.classType}` : ""}
              </button>
            )}
          </div>
        </div>

        {/* 修复建议 */}
        {issue.suggestion && (
          <div className="flex items-start gap-1.5 mt-1.5 ml-7">
            <ArrowRight size={10} className="text-[var(--text-muted)] flex-shrink-0 mt-0.5" />
            <p className="text-[9px] text-[var(--text-secondary)]">{issue.suggestion}</p>
          </div>
        )}

        {/* 一键修正按钮 */}
        {issue.suggestedValue && onFix && (
          <button
            onClick={() => onFix(issue)}
            className="flex items-center gap-1 ml-7 mt-1.5 px-2 py-1 rounded-lg bg-[var(--accent-1)]/15 border border-[var(--accent-1)]/30 text-[var(--accent-1)] hover:bg-[var(--accent-1)]/25 text-[9px] font-medium transition-all cursor-pointer"
          >
            <Wrench size={9} />
            修正为 {issue.suggestedValue.slice(0, 25)}
            {issue.suggestedValue.length > 25 ? "..." : ""}
          </button>
        )}
      </div>
    </div>
  );
}
