import { useNavStore } from "../../stores/navStore";
import { NAV_ITEMS } from "../../lib/constants";
import { cn } from "../../lib/utils";
import { useNavigate, useLocation } from "react-router-dom";

export function BottomNav() {
  const { setActiveNav } = useNavStore();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNav = (id: typeof NAV_ITEMS[number]["id"], path: string) => {
    setActiveNav(id);
    navigate(path);
  };

  return (
    <div
      className="md:hidden flex-shrink-0 flex items-center justify-around pb-safe pt-2 px-2 relative z-40"
      style={{
        background: "var(--glass-bg)",
        backdropFilter: "blur(24px)",
        borderTop: "1px solid var(--glass-border)",
        boxShadow: "0 -2px 24px rgba(0,0,0,0.3)",
      }}
    >
      {NAV_ITEMS.map((item) => {
        const isActive = location.pathname === item.path
          || (item.path !== "/" && location.pathname.startsWith(item.path));

        return (
          <button
            key={item.id}
            onClick={() => handleNav(item.id, item.path)}
            className={cn(
              "flex flex-col items-center justify-center gap-1 p-2 rounded-xl transition-all duration-300 relative",
              isActive ? "text-[var(--text-primary)]" : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            )}
          >
            {isActive && (
              <div 
                className="absolute inset-0 bg-[var(--glass-border-active)] rounded-xl opacity-50"
              />
            )}
            
            <span className={cn(
              "relative z-10 transition-transform duration-300",
              isActive ? "scale-110 drop-shadow-[0_0_8px_rgba(0,0,0,0.5)] text-[var(--accent-1)]" : "scale-100"
            )}>
              {item.icon}
            </span>
            <span className="relative z-10 text-[10px] font-medium mt-0.5">
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
