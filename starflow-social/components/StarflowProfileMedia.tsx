'use client';

import { useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { createPortal } from 'react-dom';
import { usePathname } from 'next/navigation';
import { Camera, ImagePlus, LoaderCircle, ShieldCheck } from 'lucide-react';
import { db, hasConfig } from '@/lib/supabase';

// Reuses the existing public post-media bucket and the existing avatar_url
// column. Cover files are stored under the account's own UID in /covers/.
// No database schema changes or modifications to the existing SocialApp.
const BUCKET = 'post-media';
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
type UploadKind = 'avatar' | 'cover';
type Mounts = { editor: Element | null; cover: Element | null; avatar: Element | null };

type Picture = { name: string; created_at?: string | null; updated_at?: string | null };

function verifyImage(file: File) {
  const supported = /^(image\/(jpeg|png|webp|heic|heif))$/i.test(file.type)
    || (!file.type && /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name));
  if (!supported) throw new Error('请选择 JPG、PNG、WebP 或 iPhone HEIC 照片。');
  if (file.size <= 0 || file.size > MAX_SOURCE_BYTES) throw new Error('原始图片需在 20 MB 以内。');
}

// Normalize mobile HEIC and large images before they reach the existing
// 5 MB, JPEG/PNG/WebP-only Supabase bucket. Output is always a JPEG without EXIF.
async function prepareImage(file: File, kind: UploadKind): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const picture = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('无法读取照片，请先在相册中另存为 JPG 后重试。'));
      img.src = objectUrl;
    });
    if (!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth * picture.naturalHeight > 100_000_000) {
      throw new Error('图片尺寸过大，建议先裁剪后再上传。');
    }
    const maxSide = kind === 'avatar' ? 720 : 1800;
    const ratio = Math.min(1, maxSide / Math.max(picture.naturalWidth, picture.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(picture.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(picture.naturalHeight * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法处理图片，请稍后重试。');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const encode = (quality: number) => new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('图片转换失败。')), 'image/jpeg', quality);
    });
    for (const quality of [0.88, 0.78, 0.65]) {
      const result = await encode(quality);
      if (result.size > 0 && result.size <= MAX_UPLOAD_BYTES) return result;
    }
    throw new Error('压缩后仍超过 5 MB，请选择更小的图片。');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function latestCover(profileId: string): Promise<string | null> {
  const client = db();
  const { data, error } = await client.storage.from(BUCKET).list(`${profileId}/covers`, {
    limit: 50,
    sortBy: { column: 'created_at', order: 'desc' },
  });
  if (error) throw error;
  // Storage lists only objects within the requested directory; ignore folder placeholders.
  const photos = ((data ?? []) as Picture[]).filter(item =>
    /\.(jpg|jpeg|png|webp)$/i.test(item.name) && !item.name.includes('/')
  );
  if (!photos.length) return null;
  photos.sort((a, b) => (b.created_at ?? b.updated_at ?? '').localeCompare(a.created_at ?? a.updated_at ?? ''));
  const path = `${profileId}/covers/${photos[0].name}`;
  return client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export function StarflowProfileMedia() {
  const pathname = usePathname();
  const isSettings = pathname === '/settings' || pathname === '/settings/';
  const handle = /^\/profile\/([^/]+)\/?$/.exec(pathname ?? '')?.[1] ?? null;
  const [mounts, setMounts] = useState<Mounts>({ editor: null, cover: null, avatar: null });
  const [ownId, setOwnId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(null);
  const [coverLoading, setCoverLoading] = useState(false);
  const [busy, setBusy] = useState<UploadKind | null>(null);
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (!isSettings && !handle) {
      setMounts({ editor: null, cover: null, avatar: null });
      return;
    }
    const update = () => {
      const editor = isSettings ? document.querySelector('.app-frame .settings-content form.stack') : null;
      const cover = handle ? document.querySelector('.app-frame .profile-cover') : null;
      const avatar = handle ? document.querySelector('.app-frame .profile-top .avatar') : null;
      setMounts(prev => prev.editor === editor && prev.cover === cover && prev.avatar === avatar
        ? prev : { editor, cover, avatar });
    };
    const observer = new MutationObserver(update);
    observer.observe(document.body, { subtree: true, childList: true });
    update();
    return () => observer.disconnect();
  }, [isSettings, handle]);

  useEffect(() => {
    if ((!isSettings && !handle) || !hasConfig()) return;
    let active = true;
    setOwnId(null);
    setProfileId(null);
    setAvatar(null);
    setCoverUrl(null);
    setStatus('');
    const load = async () => {
      try {
        const client = db();
        if (isSettings) {
          const { data: session, error: sessionError } = await client.auth.getUser();
          if (sessionError || !session.user) return;
          const { data: me, error: profileError } = await client.from('profiles').select('avatar_url')
            .eq('id', session.user.id).single();
          if (profileError) throw profileError;
          if (!active) return;
          setOwnId(session.user.id);
          setProfileId(session.user.id);
          setAvatar(me?.avatar_url ?? null);
        } else if (handle) {
          let decoded: string;
          try { decoded = decodeURIComponent(handle); } catch { return; }
          const [account, lookup] = await Promise.all([
            client.auth.getUser(),
            client.from('profiles').select('id').eq('handle', decoded).maybeSingle(),
          ]);
          if (lookup.error) throw lookup.error;
          if (active) {
            setProfileId(lookup.data?.id ?? null);
            // Only the authenticated owner may see direct-upload controls.
            setOwnId(!account.error && account.data.user && lookup.data && account.data.user.id === lookup.data.id
              ? account.data.user.id : null);
          }
        }
      } catch (reason) {
        if (active && isSettings) setStatus(reason instanceof Error ? reason.message : '读取个人资料失败，请重试。');
      }
    };
    void load();
    return () => { active = false; };
  }, [isSettings, handle]);

  useEffect(() => {
    if (!profileId || !hasConfig()) return;
    let active = true;
    setCoverLoading(true);
    const load = async () => {
      try {
        const url = await latestCover(profileId);
        if (active) setCoverUrl(url);
      } catch (reason) {
        if (active) {
          setCoverUrl(null);
          if (isSettings) setStatus('读取封面失败：' + (reason instanceof Error ? reason.message : '请稍后重试。'));
        }
      } finally {
        if (active) setCoverLoading(false);
      }
    };
    void load();
    return () => { active = false; };
  }, [profileId, isSettings]);

  async function upload(kind: UploadKind, event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || busy) return;
    try { verifyImage(file); } catch (reason) {
      setStatus(reason instanceof Error ? reason.message : '文件格式不正确。');
      return;
    }
    if (!ownId) {
      setStatus('请先登录账号，再修改图片。');
      return;
    }
    setBusy(kind);
    setStatus('正在上传' + (kind === 'avatar' ? '头像' : '封面') + '…');
    try {
      const client = db();
      // Ensure the editing account still matches the authenticated session.
      const { data: current, error: authError } = await client.auth.getUser();
      if (authError || current.user?.id !== ownId) throw new Error('登录状态已改变，请刷新页面后重试。');
      const optimized = await prepareImage(file, kind);
      const folder = kind === 'avatar' ? 'avatars' : 'covers';
      const path = `${ownId}/${folder}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await client.storage.from(BUCKET).upload(path, optimized, {
        contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
      });
      if (uploadError) throw uploadError;
      const publicUrl = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
      if (kind === 'avatar') {
        const { error: profileError } = await client.from('profiles').update({ avatar_url: publicUrl }).eq('id', ownId);
        if (profileError) {
          // Do not leave a failed avatar-update upload behind when cleanup is permitted.
          await client.storage.from(BUCKET).remove([path]);
          throw profileError;
        }
        setAvatar(publicUrl);
      } else {
        setCoverUrl(publicUrl);
      }
      if (handle && !isSettings) {
        setStatus((kind === 'avatar' ? '头像' : '封面') + '已保存，正在更新主页…');
        // SocialApp owns the original avatar DOM; reload updates all avatars
        // and ensures the new cover is re-read from Storage after completion.
        window.setTimeout(() => {
          if (window.location.pathname === pathname) window.location.reload();
        }, 850);
      } else {
        setStatus((kind === 'avatar' ? '头像' : '封面') + '已保存！返回个人主页或刷新页面即可看到更新。');
      }
    } catch (reason) {
      setStatus('上传失败：' + (reason instanceof Error ? reason.message : '请稍后重试。'));
    } finally { setBusy(null); }
  }

  async function removeAvatar() {
    if (!ownId || busy) return;
    setBusy('avatar');
    setStatus('正在恢复默认头像…');
    try {
      const client = db();
      const { data: current, error: authError } = await client.auth.getUser();
      if (authError || current.user?.id !== ownId) throw new Error('登录状态已改变，请刷新页面后重试。');
      const { error } = await client.from('profiles').update({ avatar_url: null }).eq('id', ownId);
      if (error) throw error;
      setAvatar(null);
      setStatus('默认头像已恢复。返回个人主页或刷新页面即可看到更新。');
    } catch (reason) {
      setStatus('操作失败：' + (reason instanceof Error ? reason.message : '请稍后重试。'));
    } finally { setBusy(null); }
  }

  if (!hasConfig()) return null;
  return <>
    {mounts.cover && handle && coverUrl && createPortal(
      <img className="sf-user-cover" src={coverUrl} alt="用户自定义主页封面" loading="eager"/>, mounts.cover,
    )}
    {mounts.cover && handle && ownId && ownId === profileId && createPortal(
      <>
        <label className="sf-profile-direct-cover" title="点击更换主页封面">
          <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
            aria-label="更换主页封面" disabled={!!busy} onChange={event => void upload('cover', event)}/>
          <span className="sf-profile-direct-cover-badge"><Camera size={16}/>{busy === 'cover' ? '上传中…' : '更换封面'}</span>
        </label>
        {status && <div role="status" aria-live="polite" className="sf-profile-direct-status">
          {busy && <LoaderCircle size={15} className="sf-profile-media-spin"/>}{status}
        </div>}
      </>, mounts.cover,
    )}
    {mounts.avatar && handle && ownId && ownId === profileId && createPortal(
      <label className="sf-profile-direct-avatar" title="点击更换头像">
        <input type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
          aria-label="更换头像" disabled={!!busy} onChange={event => void upload('avatar', event)}/>
        <span className="sf-profile-direct-avatar-icon"><Camera size={17}/></span>
      </label>, mounts.avatar,
    )}
    {mounts.editor && isSettings && createPortal(
      <div className="sf-profile-media-settings" aria-label="头像与封面管理">
        <div className="sf-profile-media-title"><Camera size={20}/><div><strong>头像与主页封面</strong><span>支持 JPG、PNG、WebP 和 iPhone HEIC，自动压缩（原图 20 MB 内）</span></div></div>
        <div className="sf-profile-media-grid">
          <section className="sf-profile-media-tile">
            <div className="sf-profile-avatar-preview">
              {avatar ? <img src={avatar} alt="当前头像" /> : <span aria-hidden="true">✦</span>}
            </div>
            <strong>个人头像</strong>
            <label className={busy ? 'sf-profile-file-btn is-busy' : 'sf-profile-file-btn'} htmlFor="sf-profile-avatar-file">
              <ImagePlus size={16}/>{busy === 'avatar' ? '上传中…' : '更换头像'}
            </label>
            <input id="sf-profile-avatar-file" type="file" accept="image/*" disabled={!!busy || !ownId}
              onChange={event => void upload('avatar', event)}/>
            {avatar && <button className="sf-profile-reset" type="button" disabled={!!busy} onClick={() => void removeAvatar()}>恢复默认头像</button>}
          </section>
          <section className="sf-profile-media-tile">
            <div className="sf-profile-cover-preview">
              {coverUrl ? <img src={coverUrl} alt="当前封面" /> : <span aria-hidden="true">粉紫渐变封面</span>}
              {coverLoading && <span className="sf-cover-loading"><LoaderCircle size={16}/> 加载中</span>}
            </div>
            <strong>个人主页封面</strong>
            <label className={busy ? 'sf-profile-file-btn is-busy' : 'sf-profile-file-btn'} htmlFor="sf-profile-cover-file">
              <ImagePlus size={16}/>{busy === 'cover' ? '上传中…' : '更换封面'}
            </label>
            <input id="sf-profile-cover-file" type="file" accept="image/*" disabled={!!busy || !ownId}
              onChange={event => void upload('cover', event)}/>
          </section>
        </div>
        <p className="sf-profile-media-tip"><ShieldCheck size={15}/> 图片会公开展示在个人主页；请勿上传包含隐私信息的照片。</p>
        {status && <p className="sf-profile-media-status" role="status">{busy && <LoaderCircle size={15} className="sf-profile-media-spin"/>}{status}</p>}
      </div>, mounts.editor,
    )}
  </>;
}
