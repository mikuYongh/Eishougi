import { FolderHeart, Users, Wand2, Settings, Workflow, History } from "lucide-react";
import { Link } from "react-router-dom";

export function MobileMenu() {
  const menuItems = [
    {
      title: "画师库",
      subtitle: "Artists",
      icon: <Users size={24} className="text-pink-400" />,
      path: "/artists",
      color: "from-pink-500/20 to-rose-500/5",
      border: "border-pink-500/20 hover:border-pink-500/50"
    },
    {
      title: "风格库",
      subtitle: "Styles",
      icon: <Wand2 size={24} className="text-purple-400" />,
      path: "/characters",
      color: "from-purple-500/20 to-fuchsia-500/5",
      border: "border-purple-500/20 hover:border-purple-500/50"
    },
    {
      title: "典藏库",
      subtitle: "Vault",
      icon: <FolderHeart size={24} className="text-yellow-400" />,
      path: "/vault",
      color: "from-yellow-500/20 to-orange-500/5",
      border: "border-yellow-500/20 hover:border-yellow-500/50"
    },
    {
      title: "工作流",
      subtitle: "Workflows",
      icon: <Workflow size={24} className="text-blue-400" />,
      path: "/workflows",
      color: "from-blue-500/20 to-cyan-500/5",
      border: "border-blue-500/20 hover:border-blue-500/50"
    },
    {
      title: "生成历史",
      subtitle: "History",
      icon: <History size={24} className="text-emerald-400" />,
      path: "/history",
      color: "from-emerald-500/20 to-teal-500/5",
      border: "border-emerald-500/20 hover:border-emerald-500/50"
    },
    {
      title: "系统设置",
      subtitle: "Settings",
      icon: <Settings size={24} className="text-gray-400" />,
      path: "/settings",
      color: "from-gray-500/20 to-slate-500/5",
      border: "border-gray-500/20 hover:border-gray-500/50"
    }
  ];

  return (
    <div className="flex flex-col h-full overflow-y-auto pb-[20vh] px-4 pt-4 custom-scrollbar">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-[var(--text-primary)]">更多功能</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">管理你的资产、模型和引擎配置</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {menuItems.map((item, idx) => (
          <Link 
            key={idx}
            to={item.path}
            className={`flex flex-col items-center justify-center p-6 rounded-3xl border bg-gradient-to-br ${item.color} ${item.border} backdrop-blur-xl shadow-lg transition-all active:scale-95`}
          >
            <div className="w-14 h-14 rounded-2xl bg-[var(--bg-layer-2)]/80 flex items-center justify-center mb-3 shadow-inner">
              {item.icon}
            </div>
            <h3 className="text-[15px] font-bold text-[var(--text-primary)] mb-0.5">{item.title}</h3>
            <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">{item.subtitle}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
