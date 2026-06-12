import { useNavStore } from "../../stores/navStore";
import { useSettingsStore } from "../../stores/settingsStore";
import { Sun, Moon } from "lucide-react";
import { NAV_ITEMS } from "../../lib/constants";
import { cn } from "../../lib/utils";
import { useNavigate, useLocation } from "react-router-dom";

export function Sidebar() {
  const { setActiveNav, isSidebarCollapsed } = useNavStore();
  const { appTheme, toggleTheme } = useSettingsStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (id: typeof NAV_ITEMS[number]["id"], path: string) => {
    setActiveNav(id);
    navigate(path);
  };

  if (isSidebarCollapsed) {
    return null;
  }

  return (
    <div
      className="w-[var(--spacing-sidebar-w)] flex flex-shrink-0 flex-col pt-3 relative z-20"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(24px)",
        borderRight: "1px solid var(--glass-border)",
        boxShadow: "1px 0 24px rgba(0,0,0,0.3)",
      }}
    >
      {/* Decorative inner border glow */}
      <div className="absolute inset-y-0 right-0 w-[1px] bg-gradient-to-b from-transparent via-white/10 to-transparent pointer-events-none" />

      {/* Section label */}
      <div className="px-3 pb-2 pt-1.5 flex items-center gap-2">
        <div className="h-1.5 w-1.5 rounded-full bg-[var(--accent-1)]" />
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--text-muted)]">
          导航菜单
        </span>
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto px-2.5 py-1 flex flex-col gap-1">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path
            || (item.path !== "/" && location.pathname.startsWith(item.path));

          return (
            <button
              key={item.id}
              onClick={() => handleNav(item.id, item.path)}
              className={cn(
                "group w-full flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-left text-[13px] font-medium transition-all duration-300 relative overflow-hidden",
                isActive
                  ? "text-[var(--text-primary)] shadow-[0_0_15px_rgba(0,0,0,0.1)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              )}
              style={{
                background: isActive ? "var(--glass-border-active)" : "transparent",
                border: isActive ? "1px solid var(--glass-border)" : "1px solid transparent",
              }}
            >
              {/* Hover highlight background */}
              <div className={cn(
                "absolute inset-0 bg-gradient-to-r from-[var(--glass-border)] to-transparent opacity-0 transition-opacity duration-300",
                !isActive && "group-hover:opacity-100"
              )} />
              
              {isActive && (
                <span
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-3/5 rounded-r-full"
                  style={{
                    background: "var(--accent-1)",
                    boxShadow: "0 0 10px var(--accent-1)"
                  }}
                />
              )}
              
              <span className={cn(
                "flex-shrink-0 transition-transform duration-300",
                isActive ? "scale-110 drop-shadow-[0_0_8px_rgba(0,0,0,0.5)]" : "group-hover:scale-110"
              )}>
                {item.icon}
              </span>
              <span className="relative z-10">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Light/Dark Mode Toggle */}
      <div
        className="flex items-center justify-center p-3 mt-auto"
        style={{ borderTop: "1px solid var(--glass-border)" }}
      >
        <div 
          onClick={() => {
            // Let the UI do standard toggle or rely on settings
            // But we actually do not use toggleTheme from store since we might want setting page
            // Or we keep the toggle working.
            toggleTheme();
          }}
          className="relative flex items-center w-full h-10 rounded-xl cursor-pointer overflow-hidden p-1 bg-[var(--bg-layer-2)] border border-[var(--glass-border)] shadow-[inset_0_2px_10px_rgba(0,0,0,0.1)] transition-colors group"
        >
          {/* Active Slider */}
          <div 
            className="absolute h-8 w-[calc(50%-4px)] rounded-lg transition-transform duration-500 shadow-md"
            style={{
              background: "var(--glass-border-active)",
              backdropFilter: "blur(10px)",
              border: "1px solid var(--glass-border)",
              transform: appTheme === "dark" ? "translateX(0)" : "translateX(100%)",
              marginLeft: appTheme === "dark" ? "2px" : "6px",
            }}
          />
          
          <div className={`flex-1 flex items-center justify-center z-10 transition-colors duration-500 ${appTheme === "dark" ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}`}>
            <Moon size={16} className={appTheme === "dark" ? "animate-[pulse_4s_ease-in-out_infinite]" : ""} />
          </div>
          <div className={`flex-1 flex items-center justify-center z-10 transition-colors duration-500 ${appTheme === "light" ? "text-yellow-500" : "text-[var(--text-muted)]"}`}>
            <Sun size={16} className={appTheme === "light" ? "animate-[spin_10s_linear_infinite]" : ""} />
          </div>
        </div>
      </div>
    </div>
  );
}
