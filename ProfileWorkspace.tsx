import { useState } from "react";
import { Check, FileBadge, FileText, ImagePlus, Link2, LockKeyhole, Plus, Trash2, Upload, UserRound } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type ProfileWorkspaceProps = { user: any };
type AssetType = "resume" | "certificate" | "achievement";

function readDataUrl(file: File, onReady: (dataUrl: string) => void) {
  const reader = new FileReader();
  reader.onload = () => onReady(String(reader.result));
  reader.readAsDataURL(file);
}

export default function ProfileWorkspace({ user }: ProfileWorkspaceProps) {
  const [name, setName] = useState(user?.name ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(user?.linkedinUrl ?? "");
  const [rank, setRank] = useState(user?.memberRank ?? "learner");
  const [primaryTrackId, setPrimaryTrackId] = useState(String(user?.primaryTrackId ?? ""));
  const [assetType, setAssetType] = useState<AssetType>("resume");
  const [assetTitle, setAssetTitle] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [assetPublic, setAssetPublic] = useState(true);
  const [assetFile, setAssetFile] = useState<File | null>(null);
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl ?? "");
  const [bannerUrl, setBannerUrl] = useState(user?.bannerUrl ?? "");
  const tracks = trpc.tracks.list.useQuery();
  const profile = trpc.profile.byId.useQuery({ userId: user?.id ?? 0 }, { enabled: Boolean(user?.id) });
  const socialStats = profile.data?.socialStats;
  const assets = trpc.profile.assets.useQuery(undefined, { enabled: Boolean(user?.id) });
  const updateProfile = trpc.profile.update.useMutation({ onSuccess: () => { profile.refetch(); toast.success("تم حفظ بيانات ملفك بنجاح"); }, onError: error => toast.error(error.message) });
  const uploadMedia = trpc.profile.uploadMedia.useMutation({ onSuccess: (data, variables) => { if (variables.kind === "avatar") setAvatarUrl(data.url); else setBannerUrl(data.url); toast.success(variables.kind === "avatar" ? "تم تحديث صورة الحساب" : "تم تحديث البانر"); }, onError: error => toast.error(error.message) });
  const addAsset = trpc.profile.addAsset.useMutation({ onSuccess: () => { setAssetTitle(""); setAssetDescription(""); setAssetFile(null); assets.refetch(); toast.success("تمت إضافة العنصر إلى ملفك"); }, onError: error => toast.error(error.message) });
  const deleteAsset = trpc.profile.deleteAsset.useMutation({ onSuccess: () => { assets.refetch(); toast.success("تمت إزالة العنصر من الملف"); } });
  const pickMedia = (kind: "avatar" | "banner", file?: File) => { if (!file) return; if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return toast.error("اختر PNG أو JPG أو WEBP."); if (file.size > 3 * 1024 * 1024) return toast.error("حجم الصورة يجب ألا يزيد عن 3 ميغابايت."); readDataUrl(file, dataUrl => uploadMedia.mutate({ kind, dataUrl })); };
  const googleName = [user?.googleGivenName, user?.googleFamilyName].filter(Boolean).join(" ");
  const posts = profile.data?.posts ?? [];
  const submitAsset = () => {
    if (!assetTitle.trim()) return toast.error("اكتب عنوانًا للعنصر أولًا");
    if (!assetFile && assetType !== "achievement") return toast.error("ارفع ملف الـCV أو الشهادة");
    if (assetFile && assetFile.size > 5 * 1024 * 1024) return toast.error("حجم الملف يجب ألا يزيد عن 5 ميغابايت");
    const send = (dataUrl?: string) => addAsset.mutate({ assetType, title: assetTitle.trim(), description: assetDescription.trim() || undefined, isPublic: assetPublic, fileName: assetFile?.name, dataUrl });
    if (assetFile) readDataUrl(assetFile, send); else send();
  };
  return <section className="module-stack profile-workspace">
    <div className="profile-card panel-card">
      <div className="profile-cover" style={bannerUrl ? { backgroundImage: `linear-gradient(90deg, rgba(3,10,14,.55), rgba(45,11,59,.45)), url(${bannerUrl})` } : undefined}>
        <label className="media-upload banner-upload"><ImagePlus size={14} /> تغيير البانر<input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => pickMedia("banner", event.target.files?.[0])} /></label>
      </div>
      <div className="profile-body">
        <div className="profile-identity"><div className="profile-avatar avatar-photo">{avatarUrl ? <img src={avatarUrl} alt="صورة المستخدم" /> : <span>{name?.[0] ?? "C"}</span>}<label className="media-upload avatar-upload"><Plus size={14} /><input type="file" accept="image/png,image/jpeg,image/webp" onChange={event => pickMedia("avatar", event.target.files?.[0])} /></label></div><div><div className="section-tag">// هويتك على CyberJocx</div><h2>{name || "عضو CyberJocx"}</h2><span>{user?.email ?? "البريد غير متاح"} · {rank.toUpperCase()}</span>{googleName && <small className="profile-google-note">الاسم المسترجع من Google: {googleName}</small>}</div></div>
        <div className="profile-stats"><div><strong>{user?.points ?? 0}</strong><span>نقاط الخبرة</span></div><div><strong>{socialStats?.followers ?? 0}</strong><span>متابعون</span></div><div><strong>{socialStats?.following ?? 0}</strong><span>أتابع</span></div><div><strong>{socialStats?.likesReceived ?? 0}</strong><span>إعجابات المجتمع</span></div></div>
      </div>
    </div>
    <div className="profile-editor panel-card"><div className="section-tag">// بيانات الحساب</div><h3>ملف واضح، ومعلوماتك الخاصة تحت سيطرتك.</h3><p className="profile-helper"><LockKeyhole size={14} /> الهاتف وLinkedIn لا يظهران في الملف العام. البريد المعروض هو بريد حساب Google.</p><div className="profile-form-grid"><label className="admin-field"><span>الاسم الظاهر</span><input value={name} onChange={event => setName(event.target.value)} /></label><label className="admin-field"><span>الهاتف الخاص</span><input value={phone} onChange={event => setPhone(event.target.value)} placeholder="01xxxxxxxxx" /></label><label className="admin-field"><span>LinkedIn</span><input value={linkedinUrl} onChange={event => setLinkedinUrl(event.target.value)} placeholder="https://linkedin.com/in/..." /></label><label className="admin-field"><span>التصنيف</span><select value={rank} onChange={event => setRank(event.target.value)}><option value="learner">متعلم</option><option value="contributor">مساهم</option><option value="analyst">محلل</option><option value="mentor">مرشد</option><option value="elite">خبير</option></select></label><label className="admin-field"><span>المسار الأساسي</span><select value={primaryTrackId} onChange={event => setPrimaryTrackId(event.target.value)}><option value="">اختر المسار</option>{tracks.data?.map(track => <option key={track.id} value={track.id}>{track.title}</option>)}</select></label><label className="admin-field full"><span>نبذة عنك</span><textarea value={bio} onChange={event => setBio(event.target.value)} placeholder="اكتب ما تتعلمه وما المجال الذي تبني فيه خبرتك..." /></label></div><button className="primary-button" disabled={updateProfile.isPending} onClick={() => updateProfile.mutate({ name, bio, avatarUrl: avatarUrl || undefined, bannerUrl: bannerUrl || undefined, phone: phone || undefined, linkedinUrl: linkedinUrl || undefined, memberRank: rank as "learner" | "contributor" | "analyst" | "mentor" | "elite", primaryTrackId: primaryTrackId ? Number(primaryTrackId) : undefined })}><Check size={15} /> حفظ التعديلات</button></div>
    <div className="profile-editor panel-card"><div className="section-tag">// السيرة والشهادات والإنجازات</div><h3>أضف ما يثبت رحلتك المهنية.</h3><p className="profile-helper">الملفات تُخزّن في التخزين الآمن، ويمكنك اختيار ظهورها في الملف العام أو إبقائها خاصة.</p><div className="profile-form-grid"><label className="admin-field"><span>نوع العنصر</span><select value={assetType} onChange={event => setAssetType(event.target.value as AssetType)}><option value="resume">CV / السيرة الذاتية</option><option value="certificate">شهادة</option><option value="achievement">إنجاز</option></select></label><label className="admin-field"><span>العنوان</span><input value={assetTitle} onChange={event => setAssetTitle(event.target.value)} placeholder="مثال: شهادة Security+" /></label><label className="admin-field full"><span>وصف مختصر</span><textarea value={assetDescription} onChange={event => setAssetDescription(event.target.value)} placeholder="ما الذي يثبته هذا العنصر؟" /></label><label className="admin-field file-field"><span>ملف PDF أو صورة {assetType === "achievement" ? "(اختياري)" : ""}</span><input type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={event => setAssetFile(event.target.files?.[0] ?? null)} /><small>{assetFile?.name ?? "حتى 5 ميغابايت"}</small></label><label className="checkbox-field"><input type="checkbox" checked={assetPublic} onChange={event => setAssetPublic(event.target.checked)} /> عرض هذا العنصر في الملف العام</label></div><button className="secondary-button" disabled={addAsset.isPending} onClick={submitAsset}><Upload size={15} /> {addAsset.isPending ? "جارٍ الرفع..." : "إضافة إلى الملف"}</button><div className="asset-grid">{(assets.data ?? []).map(asset => <article className="asset-card" key={asset.id}><div className="asset-icon">{asset.assetType === "resume" ? <FileText size={19} /> : asset.assetType === "certificate" ? <FileBadge size={19} /> : <Check size={19} />}</div><div><strong>{asset.title}</strong><span>{asset.assetType === "resume" ? "CV" : asset.assetType === "certificate" ? "شهادة" : "إنجاز"} · {asset.isPublic ? "عام" : "خاص"}</span>{asset.description && <p>{asset.description}</p>}</div><div className="asset-actions">{asset.fileUrl && <a href={asset.fileUrl} target="_blank" rel="noreferrer" title="فتح الملف"><Link2 size={15} /></a>}<button onClick={() => deleteAsset.mutate({ id: asset.id })} title="حذف"><Trash2 size={15} /></button></div></article>)}</div></div>
    <div className="profile-posts panel-card"><div className="card-head"><div><div className="section-tag">// منشوراتك</div><h3>ما نشرته داخل المجتمع</h3></div><span>{posts.length} منشور</span></div>{posts.length ? posts.map((post: any) => <article className="profile-post" key={post.id}><div className="profile-post-head"><div className="post-avatar small">{post.authorAvatarUrl ? <img src={post.authorAvatarUrl} alt="" /> : (post.author?.[0] ?? "C")}</div><span>{new Date(post.createdAt).toLocaleDateString("ar-EG")}</span></div><p>{post.content}</p>{post.imageUrl && <img className="post-image" src={post.imageUrl} alt="صورة المنشور" />}<span>{post.likesCount ?? 0} إعجاب</span></article>) : <div className="empty-state"><UserRound size={21} /><p>لم تنشر أي شيء بعد.</p></div>}</div>
  </section>;
}
