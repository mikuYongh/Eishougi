import { NAV_ITEMS } from "../../lib/constants";
import { useLocation } from "react-router-dom";
import { Search, ClipboardList } from "lucide-react";

export function TopBar() {
  const location = useLocation();
  const currentNav = NAV_ITEMS.find((n) => {
    if (n.path === "/") return location.pathname === "/";
    return location.pathname.startsWith(n.path);
  });

  return (
    <div
      className="h-14 flex-shrink-0 flex items-center gap-3 px-6 relative z-10"
      style={{
        background: "rgba(15, 10, 25, 0.4)",
        backdropFilter: "blur(24px)",
        borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        boxShadow: "0 4px 30px rgba(0, 0, 0, 0.1)",
      }}
    >
      <div className="flex items-center gap-2 text-white/90">
        <span className="opacity-80">
          {currentNav?.icon}
        </span>
        <span className="text-sm font-bold tracking-wide">
          {currentNav?.label ?? ""}
        </span>
      </div>
      <div className="flex-1" />
      <div className="flex items-center gap-4">
        {/* Search */}
        <div
          className="group flex items-center gap-2 px-3 py-1.5 rounded-full w-64 transition-all duration-300 border focus-within:w-72"
          style={{
            background: "rgba(255, 255, 255, 0.05)",
            borderColor: "rgba(255, 255, 255, 0.1)",
            boxShadow: "inset 0 1px 4px rgba(0,0,0,0.2)",
          }}
        >
          <Search size={14} className="text-white/40 group-focus-within:text-pink-400 transition-colors" />
          <input
            type="text"
            placeholder="Search prompt muse..."
            className="border-none bg-transparent outline-none text-[13px] text-white w-full font-sans placeholder:text-white/30"
          />
        </div>
        {/* Queue button */}
        <button
          className="w-9 h-9 rounded-full border cursor-pointer flex items-center justify-center relative transition-all duration-300 hover:scale-105 bg-white/5 hover:bg-white/10 text-white/70 border-white/10"
        >
          <ClipboardList size={16} />
          <span
            className="absolute top-2 right-2 w-[6px] h-[6px] rounded-full shadow-[0_0_8px_rgba(255,107,157,0.8)]"
            style={{ background: "#FF6B9D" }}
          />
        </button>
      </div>
    </div>
  );
}
