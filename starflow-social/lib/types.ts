export type Profile = {
  id: string; handle: string; display_name: string; bio: string; avatar_url: string | null;
  created_at: string;
};
export type Post = {
  id: string; author_id: string; content: string; image_url: string | null; parent_id: string | null;
  created_at: string; profiles?: Profile | Profile[] | null;
};
export type Notif = {
  id: string; recipient_id: string; actor_id: string; kind: string; post_id: string | null;
  read_at: string | null; created_at: string; profiles?: Profile | Profile[] | null;
};
export const unwrap = (val?: Profile | Profile[] | null): Profile | null => Array.isArray(val) ? (val[0] ?? null) : (val ?? null);
export const ago = (iso: string, lang: "zh" | "en" = "zh") => {
  const elapsed = Math.max(0, Date.now() - new Date(iso).getTime());
  if (elapsed < 60000) return lang === 'en' ? 'now' : '刚刚';
  if (elapsed < 3600000) return lang === "en" ? `${Math.floor(elapsed / 60000)}m` : `${Math.floor(elapsed / 60000)} 分钟`;
  if (elapsed < 86400000) return lang === "en" ? `${Math.floor(elapsed / 3600000)}h` : `${Math.floor(elapsed / 3600000)} 小时`;
  return new Date(iso).toLocaleDateString(lang === 'en' ? 'en-US' : 'zh-CN', { month: 'short', day: 'numeric' });
};
