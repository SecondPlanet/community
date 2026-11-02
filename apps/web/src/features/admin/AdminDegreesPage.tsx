import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Sparkles, Check, X } from 'lucide-react';
import { useApiMutation } from '../../hooks/useApiMutation';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import api from '../../lib/api';
import { aiApi } from '../../lib/aiApi';
import { AiGeneratePanel } from '../../components/AiGeneratePanel';
import { AdminField, AdminSelect, AdminButton, AdminLabel } from './components/AdminForm';

interface Degree {
  id: string;
  title: string;
  description?: string;
  learningPoints?: string | string[];
  icon?: string;
  costType: string;
  price: number;
  thumbnail?: string;
  status: string;
  // 后端 shapeDegree 返回 stepNumber + course 完整信息；这里宽口径只取需要的
  courses: Array<{
    id: string;
    title: string;
    orderIndex: number;
  }>;
}

interface CourseListItem {
  id: string;
  title: string;
  instructor?: string;
  status: string;
  costType: string;
}

const EMPTY_FORM = {
  title: '',
  description: '',
  learningPoints: '',
  price: 0,
  icon: 'sparkles',
  costType: 'paid',
  thumbnail: '',
  courseIds: [] as string[],
};

function learningPointsToString(v: string | string[] | undefined): string {
  if (!v) return '';
  if (Array.isArray(v)) return v.join('\n');
  try {
    const parsed = JSON.parse(v);
    if (Array.isArray(parsed)) return parsed.join('\n');
  } catch {
    // 不是 JSON 字符串,直接返回
  }
  return v;
}

function learningPointsToPayload(v: string): string[] {
  return v.split('\n').map((s) => s.trim()).filter(Boolean);
}

export function AdminDegreesPage() {
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pendingDelete, setPendingDelete] = useState<Degree | null>(null);

  const { data: degrees } = useQuery({
    queryKey: ['admin-degrees'],
    queryFn: async () => {
      const { data } = await api.get<Degree[]>('/api/v1/degrees');
      return data;
    },
  });

  // 拉全量课程供选择(只显示 published, 草稿/归档对学位无意义)
  const { data: courses } = useQuery({
    queryKey: ['admin-courses-for-degree'],
    queryFn: async () => {
      const { data } = await api.get<CourseListItem[]>('/api/v1/courses?status=published');
      return data ?? [];
    },
  });

  const [courseSearch, setCourseSearch] = useState('');

  const filteredCourses = useMemo(() => {
    if (!courses) return [];
    const q = courseSearch.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter(
      (c) => c.title.toLowerCase().includes(q) || (c.instructor ?? '').toLowerCase().includes(q),
    );
  }, [courses, courseSearch]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setIsCreating(false);
    setEditingId(null);
    setCourseSearch('');
  };

  const startEdit = (degree: Degree) => {
    setEditingId(degree.id);
    setForm({
      title: degree.title ?? '',
      description: degree.description ?? '',
      learningPoints: learningPointsToString(degree.learningPoints),
      price: degree.price ?? 0,
      icon: degree.icon ?? 'sparkles',
      costType: degree.costType ?? 'paid',
      thumbnail: degree.thumbnail ?? '',
      // 按后端返回的 orderIndex 排序, 还原选择顺序
      courseIds: [...(degree.courses ?? [])]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map((c) => c.id),
    });
    setIsCreating(true);
  };

  const toggleCourse = (courseId: string) => {
    setForm((f) => {
      const has = f.courseIds.includes(courseId);
      return {
        ...f,
        courseIds: has ? f.courseIds.filter((id) => id !== courseId) : [...f.courseIds, courseId],
      };
    });
  };

  const moveCourse = (courseId: string, direction: -1 | 1) => {
    setForm((f) => {
      const idx = f.courseIds.indexOf(courseId);
      if (idx === -1) return f;
      const next = idx + direction;
      if (next < 0 || next >= f.courseIds.length) return f;
      const arr = [...f.courseIds];
      const [item] = arr.splice(idx, 1);
      arr.splice(next, 0, item);
      return { ...f, courseIds: arr };
    });
  };

  const createMutation = useApiMutation({
    mutationFn: (payload: any) => api.post('/api/v1/degrees', payload),
    successMessage: '学位已创建',
    invalidateKeys: [['admin-degrees'], ['degrees']],
  });

  // P2-4c: 学位更新 mutation
  const updateMutation = useApiMutation({
    mutationFn: ({ id, payload }: { id: string; payload: any }) =>
      api.patch(`/api/v1/degrees/${id}`, payload),
    successMessage: '学位已更新',
    invalidateKeys: [['admin-degrees'], ['degrees']],
  });

  // 学位 ↔ 课程 绑定 (覆盖式, 顺序敏感)
  const linkCoursesMutation = useApiMutation({
    mutationFn: ({ id, courseIds }: { id: string; courseIds: string[] }) =>
      api.post(`/api/v1/degrees/${id}/courses`, {
        courses: courseIds.map((courseId, orderIndex) => ({ courseId, orderIndex })),
      }),
    successMessage: '课程已绑定',
    invalidateKeys: [['admin-degrees'], ['degrees']],
  });

  const deleteMutation = useApiMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/degrees/${id}`),
    successMessage: '学位已删除',
    invalidateKeys: [['admin-degrees'], ['degrees']],
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      title: form.title,
      description: form.description,
      learningPoints: JSON.stringify(learningPointsToPayload(form.learningPoints)),
      price: Number(form.price),
      icon: form.icon,
      costType: form.costType,
      thumbnail: form.thumbnail || undefined,
    };

    try {
      let degreeId = editingId;
      if (editingId) {
        await updateMutation.mutateAsync({ id: editingId, payload });
        // 更新走两步: 先改基本信息, 再整体替换课程绑定
        if (degreeId) {
          await linkCoursesMutation.mutateAsync({ id: degreeId, courseIds: form.courseIds });
        }
      } else {
        // 创建走单次请求: 后端在同一事务内完成 创建+绑定, 不会留下孤儿学位
        const res: any = await createMutation.mutateAsync({
          ...payload,
          courses: form.courseIds.map((courseId, orderIndex) => ({ courseId, orderIndex })),
        });
        degreeId = res?.data?.id ?? res?.id;
      }
      resetForm();
    } catch {
      // useApiMutation 内部已 toast
    }
  };

  const isSubmitting =
    createMutation.isPending ||
    updateMutation.isPending ||
    linkCoursesMutation.isPending;
  const isFormOpen = isCreating || !!editingId;

  return (
    <div>
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] dark:text-neutral-400 mb-2">
            / Admin · Degrees
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">学位管理</h2>
        </div>
        <button
          onClick={() => {
            if (isFormOpen) resetForm();
            else setIsCreating(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-3 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors"
        >
          <Plus className="w-4 h-4" /> {isFormOpen ? '取消' : '新增学位'}
        </button>
      </div>

      {isFormOpen && (
        <form onSubmit={handleSubmit} className="border-2 border-[#171717] dark:border-neutral-50 bg-white dark:bg-neutral-100 p-6 mb-8">
          <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 mb-4">
            {editingId ? '/ Edit Degree' : '/ New Degree'}
          </div>

          {!editingId && (
            <AiGeneratePanel
              type="degree"
              placeholder="例：AI 全栈工程师 / 金融大模型应用专家 / 智能体开发"
              onGenerate={(topic, hint) => aiApi.generateDegree(topic, hint)}
              onApply={(draft) => {
                setForm((f) => ({
                  ...f,
                  title: draft.title ?? '',
                  description: draft.description ?? '',
                  learningPoints: draft.learningPoints ?? '',
                  price: draft.price ?? 0,
                  icon: draft.icon ?? 'sparkles',
                  costType: draft.costType ?? 'paid',
                  thumbnail: draft.thumbnail ?? '',
                }));
              }}
            />
          )}

          <AdminField
            label="学位标题"
            required
            value={form.title}
            onChange={(v) => setForm({ ...form, title: v })}
          />
          <div className="mt-4">
            <AdminField
              label="学位描述"
              multiline
              required
              value={form.description}
              onChange={(v) => setForm({ ...form, description: v })}
            />
          </div>
          <div className="grid md:grid-cols-3 gap-4 mt-4">
            <AdminField
              label="价格"
              type="number"
              value={String(form.price)}
              onChange={(v) => setForm({ ...form, price: Number(v) })}
            />
            <AdminField
              label="图标 (lucide 名)"
              value={form.icon}
              onChange={(v) => setForm({ ...form, icon: v })}
            />
            <AdminSelect
              label="类型"
              value={form.costType}
              onChange={(v) => setForm({ ...form, costType: v })}
              options={[
                { value: 'free', label: '免费' },
                { value: 'paid', label: '付费' },
                { value: 'charity', label: '公益' },
              ]}
            />
          </div>
          <div className="mt-4">
            <AdminField
              label="封面图 URL"
              value={form.thumbnail}
              onChange={(v) => setForm({ ...form, thumbnail: v })}
            />
          </div>
          <div className="mt-4">
            <AdminField
              label="学习要点（每行一个）"
              multiline
              rows={4}
              value={form.learningPoints}
              onChange={(v) => setForm({ ...form, learningPoints: v })}
            />
          </div>

          {/* 学位 ↔ 课程 绑定 (P0 修复: 加 course 选择 UI) */}
          <div className="mt-6 pt-4 border-t-2 border-[#171717] dark:border-neutral-50">
            <AdminLabel>绑定课程 ({form.courseIds.length} 门已选, 顺序 = 学位学习路径)</AdminLabel>

            {/* 已选顺序(可上下移动 / 移除) */}
            {form.courseIds.length > 0 && (
              <ol className="mb-3 border border-[#171717] dark:border-neutral-50 divide-y divide-[#EEEDE9] dark:divide-neutral-800">
                {form.courseIds.map((cid, idx) => {
                  const c = courses?.find((x) => x.id === cid);
                  return (
                    <li
                      key={cid}
                      className="flex items-center gap-2 px-3 py-2 text-sm bg-white dark:bg-neutral-100"
                    >
                      <span className="font-black text-[#A3A3A3] w-6">{String(idx + 1).padStart(2, '0')}</span>
                      <span className="flex-1 truncate text-[#171717] dark:text-neutral-50">
                        {c?.title ?? cid}
                      </span>
                      <button
                        type="button"
                        onClick={() => moveCourse(cid, -1)}
                        disabled={idx === 0}
                        className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border border-[#171717] dark:border-neutral-50 disabled:opacity-30"
                        title="上移"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveCourse(cid, 1)}
                        disabled={idx === form.courseIds.length - 1}
                        className="px-2 py-0.5 text-[10px] font-black uppercase tracking-widest border border-[#171717] dark:border-neutral-50 disabled:opacity-30"
                        title="下移"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleCourse(cid)}
                        className="p-1 hover:bg-[#171717] hover:text-white"
                        title="移除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}

            {/* 候选课程列表(带搜索) */}
            <input
              type="text"
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder="搜索课程标题或讲师..."
              className="w-full px-3 py-2 mb-2 text-sm bg-white dark:bg-neutral-100 border border-[#171717] dark:border-neutral-50 focus:outline-none"
            />
            <div className="max-h-64 overflow-y-auto border border-[#171717] dark:border-neutral-50">
              {filteredCourses.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#666666]">无匹配课程</div>
              ) : (
                filteredCourses.map((c) => {
                  const selected = form.courseIds.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleCourse(c.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm border-b last:border-b-0 border-[#EEEDE9] dark:border-neutral-800 transition-colors ${
                        selected
                          ? 'bg-[#171717] text-white'
                          : 'bg-white dark:bg-neutral-100 hover:bg-[#F5F4F0] dark:hover:bg-neutral-800'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 flex items-center justify-center border ${
                          selected ? 'border-white bg-white text-[#171717]' : 'border-[#171717] dark:border-neutral-50'
                        }`}
                      >
                        {selected && <Check className="w-3 h-3" />}
                      </span>
                      <span className="flex-1 truncate">{c.title}</span>
                      <span className="text-[10px] uppercase tracking-widest opacity-70">{c.status}</span>
                    </button>
                  );
                })
              )}
            </div>
            <p className="mt-2 text-[10px] text-[#666666] dark:text-neutral-400">
              提示:已选课程的顺序 = 学位学习路径的步骤顺序,提交后绑定到学位。
            </p>
          </div>

          <div className="flex gap-2 mt-6 pt-4 border-t border-[#EEEDE9]">
            <AdminButton type="submit" disabled={isSubmitting}>
              {editingId ? '保存修改' : '保存学位'}
            </AdminButton>
            <AdminButton type="button" variant="secondary" onClick={resetForm}>
              取消
            </AdminButton>
          </div>
        </form>
      )}

      {/* Degree list */}
      <div className="border-2 border-[#171717] dark:border-neutral-50 bg-white dark:bg-neutral-100">
        <div className="hidden md:grid md:grid-cols-12 gap-4 p-4 border-b-2 border-[#171717] dark:border-neutral-50 text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400">
          <div className="col-span-12 md:col-span-1">#</div>
          <div className="col-span-12 md:col-span-5">Title</div>
          <div className="col-span-12 md:col-span-2">Type</div>
          <div className="col-span-12 md:col-span-1">Price</div>
          <div className="col-span-12 md:col-span-1">Courses</div>
          <div className="col-span-12 md:col-span-2 text-right">Action</div>
        </div>
        {degrees?.map((degree, i) => (
          <div
            key={degree.id}
            className={`grid grid-cols-1 md:grid-cols-12 gap-4 p-4 items-center text-sm ${
              i < (degrees?.length ?? 0) - 1 ? 'border-b border-[#EEEDE9]' : ''
            } hover:bg-[#F5F4F0] dark:hover:bg-neutral-800 transition-colors`}
          >
            <div className="col-span-12 md:col-span-1 text-[10px] font-black text-[#A3A3A3]">
              {String(i + 1).padStart(2, '0')}
            </div>
            <div className="col-span-12 md:col-span-5 font-black tracking-tight truncate">{degree.title}</div>
            <div className="col-span-12 md:col-span-2 text-xs">
              <span
                className={`inline-flex px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                  degree.costType === 'free'
                    ? 'bg-[#171717] text-white'
                    : 'border border-[#171717] dark:border-neutral-50'
                }`}
              >
                {degree.costType}
              </span>
            </div>
            <div className="col-span-12 md:col-span-1 font-bold text-sm">
              {degree.costType === 'free' ? '—' : `¥${degree.price}`}
            </div>
            <div className="col-span-12 md:col-span-1 font-bold text-sm">{degree.courses.length}</div>
            <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-1">
              <button
                onClick={() => startEdit(degree)}
                disabled={isFormOpen && editingId === degree.id}
                className="p-2 hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-30"
                title="编辑"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPendingDelete(degree)}
                className="p-2 hover:bg-[#171717] hover:text-white transition-colors"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {(!degrees || degrees.length === 0) && (
          <div className="p-16 text-center">
            <Sparkles className="w-6 h-6 mx-auto mb-3 text-[#A3A3A3]" />
            <p className="text-sm text-[#666666]">暂无学位，点击"新增学位"或使用 AI 智能填充快速创建</p>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!pendingDelete}
        onClose={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          const id = pendingDelete.id;
          setPendingDelete(null);
          await deleteMutation.mutateAsync(id);
        }}
        title="确认删除该学位?"
        description={
          pendingDelete
            ? `「${pendingDelete.title}」将彻底删除,关联的 ${pendingDelete.courses.length} 门课程报名将失效。不可恢复。`
            : ''
        }
        variant="danger"
        confirmText="确认删除"
      />
    </div>
  );
}
