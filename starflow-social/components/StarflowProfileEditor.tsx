'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Camera, Check, LoaderCircle, Trash2, X } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';
import type { Profile } from '@/lib/types';

type PhotoKind = 'avatar' | 'cover';
type PhotoDraft = { file: File; url: string } | null;
const BUCKET = 'post-media';
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;

function imageAccepted(file: File): boolean {
  return /^(image\/(jpeg|png|webp|heic|heif))$/i.test(file.type)
    || (/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name) && !file.type);
}

async function cropToJpeg(file: File, kind: PhotoKind, x: number, y: number): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const picture = new Image();
      picture.onload = () => resolve(picture);
      picture.onerror = () => reject(new Error('浏览器无法打开该照片。HEIC 照片请先在相册中转为 JPG。'));
      picture.src = objectUrl;
    });
    if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 100_000_000) {
      throw new Error('照片尺寸过大，请先裁剪后重试。');
    }
    const width = kind === 'avatar' ? 640 : 1500;
    const height = kind === 'avatar' ? 640 : 500;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('浏览器无法处理照片，请稍后重试。');
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const drawnWidth = img.naturalWidth * scale;
    const drawnHeight = img.naturalHeight * scale;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(img, (width - drawnWidth) * x / 100, (height - drawnHeight) * y / 100, drawnWidth, drawnHeight);
    for (const quality of [0.9, 0.8, 0.65]) {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('图片编码失败。')), 'image/jpeg', quality);
      });
      if (blob.size > 0 && blob.size <= MAX_OUTPUT_BYTES) return blob;
    }
    throw new Error('压缩后的文件超过 5 MB，请换一张更小的照片。');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function loadCurrentCover(profileId: string): Promise<string | null> {
  const bucket = db().storage.from(BUCKET);
  const { data, error } = await bucket.list(`${profileId}/covers`, { limit: 100, sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  const items = (data ?? []).filter(x => /\.(jpg|jpeg|png|webp)$/i.test(x.name) && !x.name.includes('/'));
  items.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
  return items.length ? bucket.getPublicUrl(`${profileId}/covers/${items[0].name}`).data.publicUrl : null;
}

/** Independent edit sheet for owner only; never changes the existing auth or timeline components. */
export function StarflowProfileEditor() {
  const pathname = usePathname();
  const decodedHandle = (() => {
    const match = /^\/profile\/([^/]+)\/?$/.exec(pathname ?? '');
    if (!match) return null;
    try { return decodeURIComponent(match[1]); } catch { return null; }
  })();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [cover, setCover] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [bio, setBio] = useState('');
  const [avatarDraft, setAvatarDraft] = useState<PhotoDraft>(null);
  const [coverDraft, setCoverDraft] = useState<PhotoDraft>(null);
  const [avatarDefault, setAvatarDefault] = useState(false);
  const [coverDefault, setCoverDefault] = useState(false);
  const [avatarX, setAvatarX] = useState(50);
  const [avatarY, setAvatarY] = useState(50);
  const [coverX, setCoverX] = useState(50);
  const [coverY, setCoverY] = useState(50);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const closeRef = useRef<HTMLButtonElement>(null);
  const closeHandlerRef = useRef<() => void>(() => {});

  useEffect(() => {
    setProfile(null);
    setOwnerId(null);
    setCover(null);
    setOpen(false);
    if (!decodedHandle || !hasConfig()) return;
    let active = true;
    const load = async () => {
      try {
        const client = db();
        const [session, lookup] = await Promise.all([
          client.auth.getUser(),
          client.from('profiles').select('id,handle,display_name,bio,avatar_url,created_at')
            .eq('handle', decodedHandle).maybeSingle(),
        ]);
        if (lookup.error) throw lookup.error;
        const person = lookup.data as Profile | null;
        if (!active || !person) return;
        setProfile(person);
        const own = !session.error && session.data.user?.id === person.id;
        setOwnerId(own ? person.id : null);
        if (own) {
          const currentCover = await loadCurrentCover(person.id);
          if (active) setCover(currentCover);
        }
      } catch {
        // Existing SocialApp is responsible for showing profile-loading errors.
      }
    };
    void load();
    return () => { active = false; };
  }, [decodedHandle]);

  const resetDrafts = useCallback(() => {
    setAvatarDraft(null);
    setCoverDraft(null);
    setAvatarDefault(false);
    setCoverDefault(false);
    setAvatarX(50); setAvatarY(50);
    setCoverX(50); setCoverY(50);
    setError('');
  }, []);

  useEffect(() => {
    return () => { if (avatarDraft) URL.revokeObjectURL(avatarDraft.url); };
  }, [avatarDraft]);
  useEffect(() => {
    return () => { if (coverDraft) URL.revokeObjectURL(coverDraft.url); };
  }, [coverDraft]);

  const startEdit = useCallback(() => {
    if (!profile || !ownerId || profile.id !== ownerId) return;
    setName(profile.display_name);
    setHandle(profile.handle);
    setBio(profile.bio ?? '');
    resetDrafts();
    setOpen(true);
  }, [profile, ownerId, resetDrafts]);

  // Capture the EXISTING owner's Edit Profile action before the older settings
  // navigation. The original control remains intact for other users and as fallback.
  useEffect(() => {
    if (!ownerId || !decodedHandle) return;
    const intercept = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const editButton = target.closest('.app-frame .profile-info .profile-top > button');
      if (!editButton || !document.contains(editButton)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      startEdit();
    };
    document.addEventListener('click', intercept, true);
    return () => document.removeEventListener('click', intercept, true);
  }, [ownerId, decodedHandle, startEdit]);

  const dirty = !!profile && (
    name !== profile.display_name || handle !== profile.handle || bio !== (profile.bio ?? '') ||
    !!avatarDraft || !!coverDraft || avatarDefault || coverDefault
  );
  const close = useCallback(() => {
    if (saving) return;
    if (dirty && !window.confirm('你有未保存的资料修改。确定放弃吗？')) return;
    resetDrafts();
    setOpen(false);
  }, [dirty, resetDrafts, saving]);

  useEffect(() => { closeHandlerRef.current = close; }, [close]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeHandlerRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selectPhoto = (kind: PhotoKind, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file) return;
    if (!imageAccepted(file)) { setError('请使用 JPG、PNG、WebP 或 iPhone HEIC 照片。'); return; }
    if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) { setError('原始照片大小必须在 20 MB 以内。'); return; }
    setError('');
    const draft: PhotoDraft = { file, url: URL.createObjectURL(file) };
    if (kind === 'avatar') { setAvatarDraft(draft); setAvatarDefault(false); setAvatarX(50); setAvatarY(50); }
    else { setCoverDraft(draft); setCoverDefault(false); setCoverX(50); setCoverY(50); }
  };

  const removeAllCovers = async (profileId: string) => {
    const bucket = db().storage.from(BUCKET);
    const entries: string[] = [];
    for (let offset = 0; offset < 1000; offset += 100) {
      const { data, error: listError } = await bucket.list(`${profileId}/covers`, { limit: 100, offset });
      if (listError) throw listError;
      const batch = data ?? [];
      entries.push(...batch.filter(x => /\.(jpg|jpeg|png|webp)$/i.test(x.name) && !x.name.includes('/'))
        .map(x => `${profileId}/covers/${x.name}`));
      if (batch.length < 100) break;
      if (offset === 900) throw new Error('封面图片数量过多，请联系管理员处理。');
    }
    if (entries.length) {
      const { error: removeError } = await bucket.remove(entries);
      if (removeError) throw removeError;
    }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ownerId || !profile || saving) return;
    const normalizedHandle = handle.trim().toLowerCase();
    const normalizedName = name.trim();
    if (!normalizedName || normalizedName.length > 60) { setError('昵称须为 1–60 个字符。'); return; }
    if (!/^[a-z0-9_]{3,24}$/.test(normalizedHandle)) { setError('用户名只能使用 3–24 位小写英文、数字和下划线。'); return; }
    if (bio.length > 160) { setError('个人简介不能超过 160 个字符。'); return; }
    setError('');
    setSaving(true);
    const uploaded: string[] = [];
    let profileUpdated = false;
    try {
      const client = db();
      const { data: auth, error: authError } = await client.auth.getUser();
      if (authError || auth.user?.id !== ownerId) throw new Error('登录状态已改变，请刷新后再试。');
      const values: { display_name: string; handle: string; bio: string; avatar_url?: string | null } = {
        display_name: normalizedName, handle: normalizedHandle, bio,
      };
      if (avatarDefault) values.avatar_url = null;
      for (const kind of ['avatar', 'cover'] as const) {
        const draft = kind === 'avatar' ? avatarDraft : coverDraft;
        if (!draft) continue;
        const jpeg = await cropToJpeg(draft.file, kind, kind === 'avatar' ? avatarX : coverX, kind === 'avatar' ? avatarY : coverY);
        const path = `${ownerId}/${kind === 'avatar' ? 'avatars' : 'covers'}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await client.storage.from(BUCKET).upload(path, jpeg, {
          contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
        });
        if (uploadError) throw uploadError;
        uploaded.push(path);
        if (kind === 'avatar') values.avatar_url = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      }
      const { error: updateError } = await client.from('profiles').update(values).eq('id', ownerId);
      if (updateError) throw updateError;
      profileUpdated = true;
      if (coverDefault && !coverDraft) await removeAllCovers(ownerId);
      // Full refresh is intentional: existing SocialApp and the separate photo
      // viewer own cached profile data, and must show the persisted result.
      window.location.assign(`/profile/${encodeURIComponent(normalizedHandle)}`);
    } catch (reason) {
      // Uploaded pictures are safe to discard if no profile write has completed.
      const client = db();
      if (!profileUpdated && uploaded.length) await client.storage.from(BUCKET).remove(uploaded);
      const message = reason instanceof Error ? reason.message : '保存失败，请检查网络后重试。';
      setError(profileUpdated ? '文字资料已保存，但恢复封面时出现问题：' + message : message);
      setSaving(false);
    }
  };

  if (!open || !ownerId || !profile || !hasConfig()) return null;
  return createPortal(<div className="sf-profile-editor-overlay" onMouseDown={event => {
    if (event.target === event.currentTarget) close();
  }}>
    <section role="dialog" aria-modal="true" aria-labelledby="sf-profile-editor-title" className="sf-profile-editor-sheet">
      <div className="sf-profile-editor-toolbar">
        <button ref={closeRef} type="button" className="sf-profile-editor-close" aria-label="关闭资料编辑" onClick={close} disabled={saving}><X size={22}/></button>
        <strong id="sf-profile-editor-title">编辑个人资料</strong>
        <button type="submit" form="sf-profile-editor-form" className="sf-profile-editor-save" disabled={saving || !dirty}>
          {saving ? <><LoaderCircle size={15} className="sf-profile-editor-spin"/>保存中</> : <><Check size={15}/>保存</>}
        </button>
      </div>
      <form id="sf-profile-editor-form" className="sf-profile-editor-form" onSubmit={event => void save(event)}>
        <div className="sf-profile-editor-photos">
          <div className="sf-profile-editor-cover">
            {coverDraft ? <img src={coverDraft.url} alt="待上传封面预览" style={{objectPosition:`${coverX}% ${coverY}%`}}/> :
              !coverDefault && cover ? <img src={cover} alt="当前主页封面"/> : null}
            <label className="sf-profile-editor-camera sf-profile-editor-cover-camera" title="更换背景图片">
              <Camera size={22}/><span className="sr-only">选择主页封面</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={saving}
                aria-label="选择新主页封面" onChange={event => selectPhoto('cover', event)}/>
            </label>
            {(cover || coverDraft) && <button type="button" className="sf-profile-editor-remove-cover"
              aria-label="恢复默认封面" disabled={saving} onClick={() => { setCoverDraft(null); setCoverDefault(true); }}><Trash2 size={17}/></button>}
          </div>
          <div className="sf-profile-editor-avatar">
            {avatarDraft ? <img src={avatarDraft.url} alt="待上传头像预览" style={{objectPosition:`${avatarX}% ${avatarY}%`}}/> :
              !avatarDefault && profile.avatar_url ? <img src={profile.avatar_url} alt="当前头像"/> : <span aria-hidden="true">{profile.display_name.slice(0,1)}</span>}
            <label className="sf-profile-editor-camera sf-profile-editor-avatar-camera" title="更换头像"><Camera size={20}/><span className="sr-only">选择新头像</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif" disabled={saving}
                aria-label="选择新头像" onChange={event => selectPhoto('avatar', event)}/>
            </label>
          </div>
        </div>
        {(avatarDraft || coverDraft) && <div className="sf-profile-editor-cropping" aria-label="照片裁剪位置">
          <strong>照片预览与裁剪</strong>
          {avatarDraft && <><label>头像水平位置<input type="range" min={0} max={100} value={avatarX} disabled={saving} onChange={e => setAvatarX(Number(e.target.value))}/></label>
            <label>头像垂直位置<input type="range" min={0} max={100} value={avatarY} disabled={saving} onChange={e => setAvatarY(Number(e.target.value))}/></label></>}
          {coverDraft && <><label>封面水平位置<input type="range" min={0} max={100} value={coverX} disabled={saving} onChange={e => setCoverX(Number(e.target.value))}/></label>
            <label>封面垂直位置<input type="range" min={0} max={100} value={coverY} disabled={saving} onChange={e => setCoverY(Number(e.target.value))}/></label></>}
          <p>保存时会按当前位置裁剪：头像为正方形，封面为 3:1。</p>
        </div>}
        {avatarDefault && <p className="sf-profile-editor-hint">保存后将恢复默认头像。</p>}
        {coverDefault && <p className="sf-profile-editor-hint">保存后将删除本账号此前上传的封面，恢复默认渐变背景。</p>}
        {!avatarDefault && profile.avatar_url && <button className="sf-profile-editor-reset-avatar" type="button" disabled={saving}
          onClick={() => { setAvatarDraft(null); setAvatarDefault(true); }}>恢复默认头像</button>}
        <div className="sf-profile-editor-fields">
          <label>显示昵称<input name="display_name" type="text" value={name} minLength={1} maxLength={60} required disabled={saving} onChange={e=>setName(e.target.value)}/></label>
          <label>用户名<input name="handle" type="text" value={handle} minLength={3} maxLength={24} required pattern="[a-z0-9_]{3,24}" disabled={saving} autoCapitalize="none"
            onChange={e=>setHandle(e.target.value.toLowerCase())}/></label>
          <label>个人简介<textarea name="bio" value={bio} rows={3} maxLength={160} disabled={saving} onChange={e=>setBio(e.target.value)}/><small>{bio.length}/160</small></label>
        </div>
        <p className="sf-profile-editor-hint">头像与封面将公开展示。资料保存后刷新网页，所有设备使用同一账号数据。</p>
        {error && <div className="sf-profile-editor-error" role="alert">{error}</div>}
      </form>
    </section>
  </div>, document.body);
}
