/**
 * AdminInstructorsPage — 讲师管理 (admin)
 *
 * 2026-08-04 新建: 之前 admin 后台缺讲师管理, 讲师是孤儿数据, 只能 SQL 操作。
 *
 * 三大块:
 *   1. 讲师列表 — 头像 / 名字 / 头衔 / 状态 (草稿/已发布) / 关联课程数
 *   2. 创建/编辑讲师 — 完整 DTO (name, slug, title, bio, avatar, social, 专长)
 *   3. 专长 (Expertise) 管理 — 简单 CRUD (增删改 label / key)
 *
 * 复用:
 *   - instructorsApi.admin* (lib/instructorsApi.ts)
 *   - useApiMutation / ConfirmDialog / Toast (admin 通用)
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Trash2, ExternalLink, Star, UserCheck, UserX, Tags, Save, X, AlertCircle } from 'lucide-react';
import { useToast } from '../../components/auth/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import api from '../../lib/api';
import {
  instructorsApi,
  type InstructorSummary,
  type InstructorExpertiseOption,
  type CreateInstructorRequest,
} from '../../lib/instructorsApi';

interface InstructorForm {
  name: string;
  nameEn: string;
  slug: string;
  title: string;
  titleEn: string;
  headline: string;
  headlineEn: string;
  bio: string;
  bioEn: string;
  avatarUrl: string;
  company: string;
  yearsOfExperience: string; // 用 string 存 input,提交转 number
  linkedinUrl: string;
  githubUrl: string;
  twitterUrl: string;
  websiteUrl: string;
  published: boolean;
  expertiseIds: string[];
}

const emptyForm: InstructorForm = {
  name: '',
  nameEn: '',
  slug: '',
  title: '',
  titleEn: '',
  headline: '',
  headlineEn: '',
  bio: '',
  bioEn: '',
  avatarUrl: '',
  company: '',
  yearsOfExperience: '',
  linkedinUrl: '',
  githubUrl: '',
  twitterUrl: '',
  websiteUrl: '',
  published: false,
  expertiseIds: [],
};

export function AdminInstructorsPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [tab, setTab] = useState<'list' | 'expertises'>('list');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<InstructorForm>(emptyForm);
  const [pendingDelete, setPendingDelete] = useState<InstructorSummary | null>(null);
  const [search, setSearch] = useState('');

  // 讲师列表
  const listQuery = useQuery({
    queryKey: ['admin-instructors', { search }],
    queryFn: () => instructorsApi.adminList({ search: search || undefined, limit: 100 }),
  });

  // 专长列表
  const expertisesQuery = useQuery({
    queryKey: ['admin-instructors', 'expertises'],
    queryFn: () => instructorsApi.listExpertises(),
  });

  const createMutation = useMutation({
    mutationFn: (payload: CreateInstructorRequest) => instructorsApi.adminCreate(payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-instructors'] });
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      showToast('讲师已创建', 'success');
      setShowForm(false);
      setForm(emptyForm);
    },
    onError: (e: any) => {
      showToast(`创建失败: ${e?.response?.data?.message ?? e.message}`, 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CreateInstructorRequest }) =>
      instructorsApi.adminUpdate(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-instructors'] });
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      showToast('讲师已更新', 'success');
      setShowForm(false);
      setEditingId(null);
      setForm(emptyForm);
    },
    onError: (e: any) => {
      showToast(`更新失败: ${e?.response?.data?.message ?? e.message}`, 'error');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => instructorsApi.adminDelete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-instructors'] });
      queryClient.invalidateQueries({ queryKey: ['instructors'] });
      showToast('讲师已软删', 'success');
      setPendingDelete(null);
    },
    onError: (e: any) => {
      showToast(`删除失败: ${e?.response?.data?.message ?? e.message}`, 'error');
    },
  });

  const startEdit = async (id: string) => {
    try {
      const data = await instructorsApi.adminGet(id);
      setForm({
        name: data.name ?? '',
        nameEn: data.nameEn ?? '',
        slug: data.slug ?? '',
        title: data.title ?? '',
        titleEn: data.titleEn ?? '',
        headline: data.headline ?? '',
        headlineEn: data.headlineEn ?? '',
        bio: data.bio ?? '',
        bioEn: data.bioEn ?? '',
        avatarUrl: data.avatarUrl ?? '',
        company: data.company ?? '',
        yearsOfExperience: data.yearsOfExperience != null ? String(data.yearsOfExperience) : '',
        linkedinUrl: data.linkedinUrl ?? '',
        githubUrl: data.githubUrl ?? '',
        twitterUrl: data.twitterUrl ?? '',
        websiteUrl: data.websiteUrl ?? '',
        published: !!data.publishedAt,
        expertiseIds: data.expertiseLinks.map((l) => l.expertise.id),
      });
      setEditingId(id);
      setShowForm(true);
    } catch (e: any) {
      showToast(`加载讲师失败: ${e.message}`, 'error');
    }
  };

  const startCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(true);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const submitForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) {
      showToast('请填写讲师姓名', 'error');
      return;
    }
    const payload: CreateInstructorRequest = {
      name: form.name.trim(),
      nameEn: form.nameEn.trim() || undefined,
      slug: form.slug.trim() || undefined,
      title: form.title.trim() || undefined,
      titleEn: form.titleEn.trim() || undefined,
      headline: form.headline.trim() || undefined,
      headlineEn: form.headlineEn.trim() || undefined,
      bio: form.bio.trim() || undefined,
      bioEn: form.bioEn.trim() || undefined,
      avatarUrl: form.avatarUrl.trim() || undefined,
      company: form.company.trim() || undefined,
      yearsOfExperience: form.yearsOfExperience ? Number(form.yearsOfExperience) : undefined,
      linkedinUrl: form.linkedinUrl.trim() || undefined,
      githubUrl: form.githubUrl.trim() || undefined,
      twitterUrl: form.twitterUrl.trim() || undefined,
      websiteUrl: form.websiteUrl.trim() || undefined,
      published: form.published,
      expertiseIds: form.expertiseIds.length > 0 ? form.expertiseIds : undefined,
    };
    if (editingId) {
      updateMutation.mutate({ id: editingId, payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleExpertise = (id: string) => {
    setForm((f) => ({
      ...f,
      expertiseIds: f.expertiseIds.includes(id)
        ? f.expertiseIds.filter((x) => x !== id)
        : [...f.expertiseIds, id],
    }));
  };

  return (
    <div>
      {/* Tabs */}
      <div className="mb-6 flex items-center gap-2 border-b-2 border-neutral-900">
        <button
          type="button"
          onClick={() => setTab('list')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
            tab === 'list'
              ? 'border-b-2 border-[#171717] -mb-0.5 text-[#171717]'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <UserCheck className="inline w-4 h-4 mr-2" /> 讲师列表 ({listQuery.data?.total ?? 0})
        </button>
        <button
          type="button"
          onClick={() => setTab('expertises')}
          className={`px-4 py-2 text-xs font-black uppercase tracking-widest transition-colors ${
            tab === 'expertises'
              ? 'border-b-2 border-[#171717] -mb-0.5 text-[#171717]'
              : 'text-neutral-500 hover:text-neutral-900'
          }`}
        >
          <Tags className="inline w-4 h-4 mr-2" /> 专长管理 ({expertisesQuery.data?.length ?? 0})
        </button>
        <div className="ml-auto">
          {tab === 'list' && !showForm && (
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex items-center gap-2 bg-[#171717] text-white px-4 py-2 text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors"
            >
              <Plus className="w-4 h-4" /> 新建讲师
            </button>
          )}
        </div>
      </div>

      {tab === 'list' && (
        <>
          {showForm ? (
            <InstructorFormView
              form={form}
              setForm={setForm}
              expertises={expertisesQuery.data ?? []}
              toggleExpertise={toggleExpertise}
              onSubmit={submitForm}
              onCancel={cancelForm}
              isEditing={!!editingId}
              isSubmitting={createMutation.isPending || updateMutation.isPending}
            />
          ) : (
            <>
              {/* 搜索 */}
              <div className="mb-4 flex items-center gap-2">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="搜索讲师名字 / 头衔 / headline…"
                  className="flex-1 max-w-sm border border-neutral-900 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]"
                />
              </div>

              {/* 讲师表格 */}
              {listQuery.isLoading ? (
                <div className="text-sm text-neutral-500">加载中…</div>
              ) : listQuery.isError ? (
                <div className="border border-error-500 bg-error-50 text-error-500 p-4 text-sm">
                  加载失败: {(listQuery.error as any)?.message}
                </div>
              ) : (listQuery.data?.items?.length ?? 0) === 0 ? (
                <div className="border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
                  还没有讲师, 点右上"新建讲师"开始。
                </div>
              ) : (
                <div className="overflow-x-auto border border-neutral-900">
                  <table className="w-full text-sm">
                    <thead className="bg-neutral-50">
                      <tr className="text-left text-xs font-black uppercase tracking-widest text-neutral-600">
                        <th className="px-4 py-3">讲师</th>
                        <th className="px-4 py-3">头衔 / 公司</th>
                        <th className="px-4 py-3">专长</th>
                        <th className="px-4 py-3">课程</th>
                        <th className="px-4 py-3">状态</th>
                        <th className="px-4 py-3 text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {listQuery.data!.items.map((inst) => (
                        <tr key={inst.id} className="border-t border-neutral-200 hover:bg-neutral-50">
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-3">
                              <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#171717] text-base font-black text-white">
                                {inst.avatarUrl ? (
                                  <img src={inst.avatarUrl} alt={inst.name} className="h-full w-full object-cover" />
                                ) : (
                                  inst.name.charAt(0)
                                )}
                              </div>
                              <div className="min-w-0">
                                <div className="font-bold">{inst.name}</div>
                                {inst.nameEn && <div className="text-xs text-neutral-500">{inst.nameEn}</div>}
                                <div className="text-xs text-neutral-400">/{inst.slug}</div>
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <div>{inst.title || <span className="text-neutral-400">—</span>}</div>
                            {inst.company && <div className="text-xs text-neutral-500">{inst.company}</div>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1 max-w-[200px]">
                              {inst.expertiseLinks.length === 0 ? (
                                <span className="text-neutral-400 text-xs">无</span>
                              ) : (
                                inst.expertiseLinks.slice(0, 3).map(({ expertise }) => (
                                  <span key={expertise.id} className="rounded-full bg-[#EEEDE9] px-2 py-0.5 text-[10px] font-semibold">
                                    {expertise.label}
                                  </span>
                                ))
                              )}
                              {inst.expertiseLinks.length > 3 && (
                                <span className="text-[10px] text-neutral-500">+{inst.expertiseLinks.length - 3}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center font-mono">{inst._count.courseLinks}</td>
                          <td className="px-4 py-3">
                            {inst.publishedAt ? (
                              <span className="inline-flex items-center gap-1 bg-success-500 text-white px-2 py-0.5 text-[10px] font-black uppercase">
                                <UserCheck className="w-3 h-3" /> 已发布
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 bg-neutral-200 text-neutral-600 px-2 py-0.5 text-[10px] font-black uppercase">
                                <UserX className="w-3 h-3" /> 草稿
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <a
                                href={`/instructors/${inst.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-neutral-600 hover:text-[#171717]"
                                title="前台预览"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => startEdit(inst.id)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-neutral-600 hover:text-[#171717]"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setPendingDelete(inst)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs text-error-500 hover:text-error-600"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </>
      )}

      {tab === 'expertises' && (
        <ExpertisesTab
          expertises={expertisesQuery.data ?? []}
          isLoading={expertisesQuery.isLoading}
          onChanged={() => {
            queryClient.invalidateQueries({ queryKey: ['admin-instructors', 'expertises'] });
            queryClient.invalidateQueries({ queryKey: ['instructors', 'expertises'] });
          }}
          showToast={showToast}
        />
      )}

      {pendingDelete && (
        <ConfirmDialog
          open={!!pendingDelete}
          onClose={() => setPendingDelete(null)}
          title="软删讲师"
          description={
            <div className="space-y-2">
              <p>确认软删 <strong>{pendingDelete.name}</strong> ?</p>
              <div className="flex items-start gap-2 rounded border border-warning-500 bg-warning-50 p-3 text-xs text-warning-600">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  软删会: 1) 置为草稿, 前台不再展示; 2) 解除该讲师的所有课程挂载。
                  物理删除需 Prisma 脚本, 业务端不开放。
                </div>
              </div>
            </div>
          }
          confirmText="软删"
          variant="danger"
          onConfirm={() => deleteMutation.mutate(pendingDelete.id)}
        />
      )}
    </div>
  );
}

// =============================================================
// 讲师表单
// =============================================================

function InstructorFormView({
  form,
  setForm,
  expertises,
  toggleExpertise,
  onSubmit,
  onCancel,
  isEditing,
  isSubmitting,
}: {
  form: InstructorForm;
  setForm: React.Dispatch<React.SetStateAction<InstructorForm>>;
  expertises: InstructorExpertiseOption[];
  toggleExpertise: (id: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
  isEditing: boolean;
  isSubmitting: boolean;
}) {
  return (
    <form onSubmit={onSubmit} className="space-y-6 border border-neutral-900 bg-white p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-black">{isEditing ? '编辑讲师' : '新建讲师'}</h2>
        <button type="button" onClick={onCancel} className="text-neutral-500 hover:text-neutral-900">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* 基本信息 */}
      <Section title="基本信息">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="姓名 *" required>
            <Input value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
          </Field>
          <Field label="英文名">
            <Input value={form.nameEn} onChange={(v) => setForm({ ...form, nameEn: v })} />
          </Field>
          <Field label="Slug (留空自动生成)">
            <Input
              value={form.slug}
              onChange={(v) => setForm({ ...form, slug: v })}
              placeholder="e.g. sky-walker"
              mono
            />
          </Field>
          <Field label="头像 URL">
            <Input
              value={form.avatarUrl}
              onChange={(v) => setForm({ ...form, avatarUrl: v })}
              placeholder="https://..."
            />
          </Field>
        </div>
      </Section>

      {/* 头衔 & 公司 */}
      <Section title="头衔 / 公司">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="头衔 (中文)">
            <Input value={form.title} onChange={(v) => setForm({ ...form, title: v })} placeholder="首席云架构师" />
          </Field>
          <Field label="头衔 (英文)">
            <Input value={form.titleEn} onChange={(v) => setForm({ ...form, titleEn: v })} />
          </Field>
          <Field label="公司">
            <Input value={form.company} onChange={(v) => setForm({ ...form, company: v })} />
          </Field>
          <Field label="从业年限">
            <Input
              type="number"
              value={form.yearsOfExperience}
              onChange={(v) => setForm({ ...form, yearsOfExperience: v })}
              placeholder="0"
            />
          </Field>
        </div>
      </Section>

      {/* headline & bio */}
      <Section title="一句话简介 / 长 bio">
        <div className="space-y-4">
          <Field label="Headline (中文) — 列表卡片用">
            <Input
              value={form.headline}
              onChange={(v) => setForm({ ...form, headline: v })}
              placeholder="把复杂云原生系统拆成可读代码"
            />
          </Field>
          <Field label="Headline (英文)">
            <Input
              value={form.headlineEn}
              onChange={(v) => setForm({ ...form, headlineEn: v })}
            />
          </Field>
          <Field label="Bio (中文) — 详情页用, 支持换行">
            <TextArea
              value={form.bio}
              onChange={(v) => setForm({ ...form, bio: v })}
              rows={5}
            />
          </Field>
          <Field label="Bio (英文)">
            <TextArea
              value={form.bioEn}
              onChange={(v) => setForm({ ...form, bioEn: v })}
              rows={5}
            />
          </Field>
        </div>
      </Section>

      {/* 社交链接 */}
      <Section title="社交链接">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="LinkedIn">
            <Input value={form.linkedinUrl} onChange={(v) => setForm({ ...form, linkedinUrl: v })} />
          </Field>
          <Field label="GitHub">
            <Input value={form.githubUrl} onChange={(v) => setForm({ ...form, githubUrl: v })} />
          </Field>
          <Field label="Twitter / X">
            <Input value={form.twitterUrl} onChange={(v) => setForm({ ...form, twitterUrl: v })} />
          </Field>
          <Field label="个人网站">
            <Input value={form.websiteUrl} onChange={(v) => setForm({ ...form, websiteUrl: v })} />
          </Field>
        </div>
      </Section>

      {/* 专长 */}
      <Section title={`专长 (${form.expertiseIds.length} / ${expertises.length})`}>
        {expertises.length === 0 ? (
          <p className="text-sm text-neutral-500">
            还没有专长, 请先到"专长管理" tab 创建。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {expertises.map((e) => {
              const active = form.expertiseIds.includes(e.id);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => toggleExpertise(e.id)}
                  className={`inline-flex min-h-8 items-center px-3 py-1 text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-[#171717] text-white'
                      : 'border border-neutral-200 bg-white text-neutral-700 hover:border-[#171717]'
                  }`}
                >
                  {e.label}
                </button>
              );
            })}
          </div>
        )}
      </Section>

      {/* 发布 */}
      <Section title="发布状态">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.published}
            onChange={(e) => setForm({ ...form, published: e.target.checked })}
            className="h-4 w-4"
          />
          <span>立即发布 (前台 /instructors 列表可看到)</span>
        </label>
      </Section>

      {/* 提交 */}
      <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-xs font-black uppercase tracking-widest text-neutral-600 hover:text-neutral-900"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 bg-[#171717] text-white px-4 py-2 text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors disabled:opacity-50"
        >
          <Save className="w-4 h-4" />
          {isSubmitting ? '提交中…' : isEditing ? '保存修改' : '创建讲师'}
        </button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-black uppercase tracking-widest text-neutral-500">{title}</h3>
      {children}
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs font-semibold text-neutral-600 mb-1">
        {label}
        {required && <span className="ml-1 text-error-500">*</span>}
      </div>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  required,
  mono,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  mono?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className={`w-full border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#171717] ${mono ? 'font-mono' : ''}`}
    />
  );
}

function TextArea({
  value,
  onChange,
  rows = 4,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className="w-full border border-neutral-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#171717]"
    />
  );
}

// =============================================================
// 专长 (Expertise) 管理 tab
// =============================================================

function ExpertisesTab({
  expertises,
  isLoading,
  onChanged,
  showToast,
}: {
  expertises: InstructorExpertiseOption[];
  isLoading: boolean;
  onChanged: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ key: '', label: '', labelEn: '', orderIndex: 0 });

  // 专长管理端点 (P2 fix: 改顶部 static import, 不再 dynamic import)
  const [pendingDeleteExpertise, setPendingDeleteExpertise] = useState<InstructorExpertiseOption | null>(null);

  const createMut = useMutation({
    mutationFn: async (payload: typeof form) => {
      const { data } = await api.post('/api/v1/admin/instructors/expertises', payload);
      return data;
    },
    onSuccess: () => {
      onChanged();
      showToast('专长已创建', 'success');
      setShowCreate(false);
      setForm({ key: '', label: '', labelEn: '', orderIndex: 0 });
    },
    onError: (e: any) => showToast(`创建失败: ${e?.response?.data?.message ?? e.message}`, 'error'),
  });

  const updateMut = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: Partial<typeof form> }) => {
      const { data } = await api.patch(`/api/v1/admin/instructors/expertises/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      onChanged();
      showToast('专长已更新', 'success');
      setEditingId(null);
    },
    onError: (e: any) => showToast(`更新失败: ${e?.response?.data?.message ?? e.message}`, 'error'),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/api/v1/admin/instructors/expertises/${id}`);
      return data;
    },
    onSuccess: () => {
      onChanged();
      showToast('专长已删除', 'success');
      setPendingDeleteExpertise(null);
    },
    onError: (e: any) => showToast(`删除失败: ${e?.response?.data?.message ?? e.message}`, 'error'),
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-black">专长标签</h2>
        {!showCreate && (
          <button
            type="button"
            onClick={() => {
              setForm({ key: '', label: '', labelEn: '', orderIndex: 0 });
              setShowCreate(true);
            }}
            className="inline-flex items-center gap-2 bg-[#171717] text-white px-4 py-2 text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors"
          >
            <Plus className="w-4 h-4" /> 新建专长
          </button>
        )}
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.key.trim() || !form.label.trim()) {
              showToast('key 和 label 必填', 'error');
              return;
            }
            createMut.mutate(form);
          }}
          className="mb-4 border border-neutral-900 bg-white p-4 space-y-3"
        >
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <Field label="Key (英文, 唯一)*" required>
              <Input value={form.key} onChange={(v) => setForm({ ...form, key: v })} placeholder="e.g. devops" mono />
            </Field>
            <Field label="Label (中文)*" required>
              <Input value={form.label} onChange={(v) => setForm({ ...form, label: v })} placeholder="DevOps" />
            </Field>
            <Field label="Label (英文)">
              <Input value={form.labelEn} onChange={(v) => setForm({ ...form, labelEn: v })} />
            </Field>
            <Field label="排序">
              <Input
                type="number"
                value={String(form.orderIndex)}
                onChange={(v) => setForm({ ...form, orderIndex: Number(v) || 0 })}
              />
            </Field>
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-neutral-200 pt-3">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-3 py-1.5 text-xs font-black uppercase tracking-widest text-neutral-600"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={createMut.isPending}
              className="inline-flex items-center gap-1 bg-[#171717] text-white px-3 py-1.5 text-xs font-black uppercase tracking-widest hover:bg-[#262626] disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" /> 创建
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="text-sm text-neutral-500">加载中…</div>
      ) : expertises.length === 0 ? (
        <div className="border border-dashed border-neutral-300 p-8 text-center text-sm text-neutral-500">
          还没有专长。
        </div>
      ) : (
        <div className="overflow-x-auto border border-neutral-900">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr className="text-left text-xs font-black uppercase tracking-widest text-neutral-600">
                <th className="px-4 py-3">Key</th>
                <th className="px-4 py-3">Label (中文)</th>
                <th className="px-4 py-3">Label (英文)</th>
                <th className="px-4 py-3 text-center">排序</th>
                <th className="px-4 py-3 text-center">状态</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {expertises.map((e) => (
                <tr key={e.id} className="border-t border-neutral-200 hover:bg-neutral-50">
                  {editingId === e.id ? (
                    <>
                      <td className="px-4 py-2 font-mono text-xs">{e.key}</td>
                      <td className="px-4 py-2">
                        <Input value={form.label} onChange={(v) => setForm({ ...form, label: v })} />
                      </td>
                      <td className="px-4 py-2">
                        <Input value={form.labelEn} onChange={(v) => setForm({ ...form, labelEn: v })} />
                      </td>
                      <td className="px-4 py-2 text-center">
                        <Input
                          type="number"
                          value={String(form.orderIndex)}
                          onChange={(v) => setForm({ ...form, orderIndex: Number(v) || 0 })}
                        />
                      </td>
                      <td className="px-4 py-2 text-center">{e.isActive ? '✓' : '✗'}</td>
                      <td className="px-4 py-2 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              updateMut.mutate({
                                id: e.id,
                                payload: { label: form.label, labelEn: form.labelEn, orderIndex: form.orderIndex },
                              });
                            }}
                            className="px-2 py-1 text-xs text-success-500 hover:text-success-600"
                          >
                            <Save className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="px-2 py-1 text-xs text-neutral-500 hover:text-neutral-900"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="px-4 py-3 font-mono text-xs">{e.key}</td>
                      <td className="px-4 py-3 font-bold">{e.label}</td>
                      <td className="px-4 py-3 text-neutral-600">{e.labelEn || '—'}</td>
                      <td className="px-4 py-3 text-center font-mono">{e.orderIndex}</td>
                      <td className="px-4 py-3 text-center">
                        {e.isActive ? (
                          <Star className="inline w-3.5 h-3.5 fill-current text-success-500" />
                        ) : (
                          <span className="text-neutral-400">停用</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setForm({ key: e.key, label: e.label, labelEn: e.labelEn ?? '', orderIndex: e.orderIndex });
                              setEditingId(e.id);
                            }}
                            className="px-2 py-1 text-xs text-neutral-600 hover:text-[#171717]"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDeleteExpertise(e)}
                            className="px-2 py-1 text-xs text-error-500 hover:text-error-600"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pendingDeleteExpertise && (
        <ConfirmDialog
          open={!!pendingDeleteExpertise}
          onClose={() => setPendingDeleteExpertise(null)}
          title={`删除专长 "${pendingDeleteExpertise.label}"?`}
          description="会级联删除所有讲师关联, 且不可恢复。"
          variant="danger"
          confirmText="删除"
          onConfirm={() => deleteMut.mutate(pendingDeleteExpertise.id)}
        />
      )}
    </div>
  );
}
