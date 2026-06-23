import { useState, useEffect } from "react";

let cachedVersion: string | null = null;

export function useAppVersion(): string {
  const [version, setVersion] = useState(cachedVersion ?? "0.0.0");

  useEffect(() => {
    if (cachedVersion) return;
    import("@tauri-apps/api/app")
      .then(({ getVersion }) => getVersion())
      .then((v) => {
        cachedVersion = v;
        setVersion(v);
      })
      .catch(() => {});
  }, []);

  return version;
}
