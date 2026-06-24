import { FolderHeart, Users, Wand2, Settings, Workflow, History, ChevronRight } from "lucide-react";
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
      title: "角色图鉴",
      subtitle: "Characters",
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
        <p className="text-sm text-[var(--text-secondary)] mt-1">管理你的资产、模型和引擎配置</p>
      </div>

      <div className="flex flex-col gap-3">
        {menuItems.map((item, idx) => (
          <Link 
            key={idx}
            to={item.path}
            className={`flex items-center p-4 rounded-2xl border bg-gradient-to-r ${item.color} ${item.border} backdrop-blur-xl shadow-lg transition-all active:scale-[0.98] hover:-translate-y-0.5 group`}
          >
            <div className="w-12 h-12 rounded-xl bg-[var(--glass-bg-hover)] flex items-center justify-center mr-4 shadow-inner group-hover:scale-110 transition-transform duration-300">
              {item.icon}
            </div>
            <div className="flex-1 flex flex-col justify-center">
              <h3 className="text-[16px] font-bold text-[var(--text-primary)] tracking-wide mb-0.5">{item.title}</h3>
              <span className="text-[11px] text-[var(--text-secondary)] uppercase tracking-wider font-medium">{item.subtitle}</span>
            </div>
            <div className="w-8 h-8 rounded-full bg-[var(--glass-bg)] flex items-center justify-center text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] group-hover:bg-[var(--glass-bg-hover)] transition-all">
              <ChevronRight size={16} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
