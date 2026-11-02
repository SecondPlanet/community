import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Edit2, Award, ChevronRight, ChevronDown, X, Layers } from 'lucide-react';
import { useApiMutation } from '../../hooks/useApiMutation';
import { useToast } from '../../components/auth/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { badgesApi } from '../../lib/badgesApi';
import api from '../../lib/api';
import type {
  Badge,
  BadgeCriteriaType,
  BadgeCriteriaRule,
  BadgeCriteriaOp,
} from '@secondplanet/shared-types';

const criteriaTypeOptions: { value: BadgeCriteriaType; label: string }[] = [
  { value: 'course_completed', label: '完成课程' },
  { value: 'lessons_completed', label: '累计课时' },
  { value: 'streak_days', label: '连续学习天数' },
  { value: 'first_enrollment', label: '首次报名' },
  { value: 'practice_completed', label: '完成实践项目' },
  { value: 'points_reached', label: '积分达到' },
  // P1 修复(2026-07-24): 完成指定课程 (advanced DSL 才用得到, 在叶子节点配 courseId)
  { value: 'course_specific', label: '完成指定课程 (需配 courseId)' },
];

interface BadgeForm {
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  criteriaType: BadgeCriteriaType;
  criteriaValue: number;
  points: number;
  isActive: boolean;
  orderIndex: number;
  useAdvanced: boolean;
  criteriaJson: BadgeCriteriaRule | null;
  // P1 修复(2026-07-24): course_specific 用 — 提交时套到 criteriaJson.courseId
  specificCourseId: string;
}

const emptyForm: BadgeForm = {
  code: '',
  name: '',
  description: '',
  icon: 'award',
  category: 'general',
  criteriaType: 'lessons_completed' as BadgeCriteriaType,
  criteriaValue: 1,
  points: 0,
  isActive: true,
  orderIndex: 0,
  useAdvanced: false,
  criteriaJson: null,
  specificCourseId: '',
};

export function AdminBadgesPage() {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [pendingDelete, setPendingDelete] = useState<Badge | null>(null);

  const { data: badges } = useQuery({
    queryKey: ['admin-badges'],
    queryFn: () => badgesApi.getAll(),
  });

  const { data: courses } = useQuery({
    queryKey: ['admin-courses-for-badges'],
    queryFn: async () => {
      const { data } = await api.get<Array<{ id: string; title: string; status: string }>>(
        '/api/v1/courses',
      );
      return data ?? [];
    },
  });

  const createMutation = useMutation({
    mutationFn: badgesApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-badges'] });
      queryClient.invalidateQueries({ queryKey: ['my-badges'] });
      resetForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof emptyForm> }) => badgesApi.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-badges'] });
      queryClient.invalidateQueries({ queryKey: ['my-badges'] });
      resetForm();
    },
  });

  // P2-4b: 接 ConfirmDialog
  const deleteMutation = useApiMutation({
    mutationFn: badgesApi.delete,
    successMessage: '徽章已删除',
    invalidateKeys: [['admin-badges'], ['my-badges']],
  });

  const resetForm = () => {
    setIsCreating(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const startEdit = (badge: Badge) => {
    setEditingId(badge.id);
    setForm({
      code: badge.code,
      name: badge.name,
      description: badge.description,
      icon: badge.icon,
      category: badge.category,
      criteriaType: badge.criteriaType,
      criteriaValue: badge.criteriaValue,
      points: badge.points,
      isActive: badge.isActive,
      orderIndex: badge.orderIndex,
      useAdvanced: !!badge.criteriaJson,
      criteriaJson: badge.criteriaJson ?? null,
      specificCourseId: (badge.criteriaJson as any)?.courseId ?? '',
    });
    setIsCreating(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const base = {
      code: form.code,
      name: form.name,
      description: form.description,
      icon: form.icon,
      category: form.category,
      criteriaType: form.criteriaType,
      criteriaValue: Number(form.criteriaValue),
      points: Number(form.points),
      isActive: form.isActive,
      orderIndex: Number(form.orderIndex),
    };
    // P1-3: 嵌套规则优先 — useAdvanced 时清掉旧 flat 字段
    let payload: any = form.useAdvanced
      ? { ...base, criteriaValue: 1, criteriaJson: form.criteriaJson }
      : { ...base, criteriaJson: null };

    // P1 修复(2026-07-24): course_specific 时自动套 courseId 到 criteriaJson
    if (form.criteriaType === 'course_specific') {
      if (!form.specificCourseId.trim()) {
        showToast('course_specific 必须填 courseId', 'error');
        return;
      }
      payload = {
        ...base,
        criteriaValue: 1,
        criteriaJson: { type: 'course_specific', value: 1, courseId: form.specificCourseId.trim() },
      };
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  return (
    <div>
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] dark:text-neutral-400 dark:text-neutral-400 mb-2">
            / Admin · Badges
          </div>
          <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">徽章管理</h2>
        </div>
        <button
          onClick={() => {
            resetForm();
            setIsCreating(true);
          }}
          className="inline-flex items-center gap-2 px-5 py-3 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors"
        >
          <Plus className="w-4 h-4" /> 新增徽章
        </button>
      </div>

      {isCreating && (
        <form
          onSubmit={handleSubmit}
          className="border-2 border-[#171717] dark:border-neutral-50 dark:border-neutral-50 bg-white dark:bg-neutral-100 dark:bg-neutral-100 p-6 mb-8"
        >
          <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 dark:text-neutral-400 mb-4">
            {editingId ? `/ Edit Badge · ${form.code}` : '/ New Badge'}
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <BrutalField
              label="唯一标识 Code"
              value={form.code}
              onChange={(v) => setForm({ ...form, code: v })}
              required
              disabled={!!editingId}
            />
            <BrutalField
              label="徽章名称"
              value={form.name}
              onChange={(v) => setForm({ ...form, name: v })}
              required
            />
            <BrutalField
              label="图标名（如 award）"
              value={form.icon}
              onChange={(v) => setForm({ ...form, icon: v })}
            />
            <BrutalField
              label="分组 Category"
              value={form.category}
              onChange={(v) => setForm({ ...form, category: v })}
            />
          </div>

          {/* P1-3 嵌套规则切换 */}
          <div className="mt-4 p-3 border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 bg-[#F5F4F0] dark:bg-neutral-800 dark:bg-neutral-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4" />
              <div>
                <div className="text-xs font-black uppercase tracking-widest">
                  高级 · 嵌套条件 DSL
                </div>
                <div className="text-[10px] text-[#666666] dark:text-neutral-400 dark:text-neutral-400 mt-0.5">
                  AND / OR / NOT 组合多条件 · 提交时自动覆盖单条件
                </div>
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-widest cursor-pointer">
              <input
                type="checkbox"
                checked={form.useAdvanced}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  setForm((f) => ({
                    ...f,
                    useAdvanced: enabled,
                    // 首次开启给一个默认 AND 组合
                    criteriaJson:
                      enabled && !f.criteriaJson
                        ? { op: 'and', rules: [{ type: f.criteriaType, value: f.criteriaValue }] }
                        : f.criteriaJson,
                  }));
                }}
                className="w-4 h-4 accent-[#171717]"
              />
              {form.useAdvanced ? '已开启' : '关闭'}
            </label>
          </div>

          {!form.useAdvanced ? (
            <div className="grid md:grid-cols-2 gap-4 mt-4">
              <BrutalSelect
                label="达成条件类型"
                value={form.criteriaType}
                onChange={(v) => setForm({ ...form, criteriaType: v as BadgeCriteriaType })}
                options={criteriaTypeOptions.map((o) => ({ value: o.value, label: o.label }))}
              />
              <BrutalField
                label="达成阈值"
                type="number"
                value={String(form.criteriaValue)}
                onChange={(v) => setForm({ ...form, criteriaValue: Number(v) })}
                disabled={form.criteriaType === 'course_specific'}
              />
              {/* P1 修复(2026-07-24): course_specific 时显示 courseId 输入 */}
              {form.criteriaType === 'course_specific' && (
                <div className="md:col-span-2">
                  <BrutalSelect
                    label="目标课程"
                    value={form.specificCourseId}
                    onChange={(v) => setForm({ ...form, specificCourseId: v })}
                    options={[
                      { value: '', label: '— 从课程库选择 —' },
                      ...(courses ?? []).map((course) => ({
                        value: course.id,
                        label: `${course.title}${course.status !== 'published' ? ' · 草稿' : ''}`,
                      })),
                    ]}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="mt-4">
              <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 dark:text-neutral-400 mb-2 block">
                嵌套规则
              </label>
              <RuleBuilder
                rule={form.criteriaJson ?? { op: 'and', rules: [] }}
                onChange={(r) => setForm({ ...form, criteriaJson: r })}
                depth={0}
                courses={courses ?? []}
              />
            </div>
          )}

          <div className="grid md:grid-cols-2 gap-4 mt-4">
            <BrutalField
              label="解锁奖励积分"
              type="number"
              value={String(form.points)}
              onChange={(v) => setForm({ ...form, points: Number(v) })}
            />
            <BrutalField
              label="排序"
              type="number"
              value={String(form.orderIndex)}
              onChange={(v) => setForm({ ...form, orderIndex: Number(v) })}
            />
          </div>
          <div className="mt-4">
            <BrutalField
              label="描述 / 解锁条件"
              value={form.description}
              onChange={(v) => setForm({ ...form, description: v })}
              required
              multiline
            />
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              className="w-4 h-4 border-2 border-[#171717] dark:border-neutral-50 dark:border-neutral-50 accent-[#171717]"
            />
            <span className="font-black uppercase tracking-widest text-[10px]">启用</span>
          </label>
          <div className="flex gap-2 mt-6 pt-4 border-t border-[#EEEDE9]">
            <button
              type="submit"
              className="px-6 py-3 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors"
            >
              {editingId ? '更新' : '保存'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="px-6 py-3 border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 text-[#171717] dark:text-neutral-50 dark:text-neutral-50 text-xs font-black uppercase tracking-widest hover:bg-[#EEEDE9] dark:bg-neutral-800 dark:hover:bg-neutral-800 dark:hover:bg-neutral-800 transition-colors"
            >
              取消
            </button>
          </div>
        </form>
      )}

      <div className="border-2 border-[#171717] dark:border-neutral-50 dark:border-neutral-50 bg-white dark:bg-neutral-100 dark:bg-neutral-100">
        <div className="hidden md:grid md:grid-cols-12 gap-4 p-4 border-b-2 border-[#171717] dark:border-neutral-50 dark:border-neutral-50 text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 dark:text-neutral-400">
          <div className="col-span-12 md:col-span-1">#</div>
          <div className="col-span-12 md:col-span-4">Badge</div>
          <div className="col-span-12 md:col-span-2">Condition</div>
          <div className="col-span-12 md:col-span-1">Pts</div>
          <div className="col-span-12 md:col-span-2">Status</div>
          <div className="col-span-12 md:col-span-2 text-right">Action</div>
        </div>
        {badges?.map((badge, i) => (
          <div
            key={badge.id}
            className={`grid grid-cols-1 md:grid-cols-12 gap-4 p-4 items-center text-sm ${
              i < (badges?.length ?? 0) - 1 ? 'border-b border-[#EEEDE9]' : ''
            } hover:bg-[#F5F4F0] dark:bg-neutral-800 dark:hover:bg-neutral-800 dark:hover:bg-neutral-800 transition-colors`}
          >
            <div className="col-span-12 md:col-span-1 text-[10px] font-black text-[#A3A3A3]">
              {String(i + 1).padStart(2, '0')}
            </div>
            <div className="col-span-12 md:col-span-4 flex items-center gap-3 min-w-0">
              <div className="shrink-0 w-9 h-9 bg-[#171717] text-white flex items-center justify-center">
                <Award className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="font-black tracking-tight truncate">{badge.name}</div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 dark:text-neutral-400">
                  {badge.code}
                </div>
              </div>
            </div>
            <div className="col-span-12 md:col-span-2 text-xs">
              {criteriaTypeOptions.find((o) => o.value === badge.criteriaType)?.label} ≥ {badge.criteriaValue}
            </div>
            <div className="col-span-12 md:col-span-1 font-black tracking-tighter text-sm">{badge.points}</div>
            <div className="col-span-12 md:col-span-2">
              <span
                className={`inline-flex px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${
                  badge.isActive
                    ? 'bg-[#171717] text-white'
                    : 'border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 text-[#171717] dark:text-neutral-50 dark:text-neutral-50'
                }`}
              >
                {badge.isActive ? 'Active' : 'Disabled'}
              </span>
            </div>
            <div className="col-span-12 md:col-span-2 flex items-center justify-end gap-1">
              <button
                onClick={() => startEdit(badge)}
                className="p-2 hover:bg-[#171717] hover:text-white transition-colors"
                title="编辑"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setPendingDelete(badge)}
                className="p-2 hover:bg-[#171717] hover:text-white transition-colors"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
        {(!badges || badges.length === 0) && (
          <div className="p-16 text-center text-sm text-[#666666] dark:text-neutral-400 dark:text-neutral-400">暂无徽章</div>
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
        title="确认删除该徽章?"
        description={
          pendingDelete
            ? `「${pendingDelete.name}」(code: ${pendingDelete.code})删除后不可恢复,已发放的徽章记录将无法继续匹配该规则。`
            : ''
        }
        variant="danger"
        confirmText="确认删除"
      />
    </div>
  );
}

function BrutalField({
  label,
  value,
  onChange,
  type = 'text',
  required,
  multiline,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  multiline?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 dark:text-neutral-400 mb-2 flex items-center gap-1">
        {label}
        {required && <span className="text-red-600">*</span>}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-white dark:bg-neutral-100 dark:bg-neutral-100 border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 text-sm focus:outline-none focus:bg-[#EEEDE9] dark:bg-neutral-800 dark:focus:bg-neutral-800 dark:focus:bg-neutral-800 transition-colors resize-none disabled:opacity-50"
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          className="w-full px-4 py-3 bg-white dark:bg-neutral-100 dark:bg-neutral-100 border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 text-sm focus:outline-none focus:bg-[#EEEDE9] dark:bg-neutral-800 dark:focus:bg-neutral-800 dark:focus:bg-neutral-800 transition-colors disabled:opacity-50"
        />
      )}
    </div>
  );
}

function BrutalSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 dark:text-neutral-400 mb-2 block">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-3 bg-white dark:bg-neutral-100 dark:bg-neutral-100 border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 text-sm focus:outline-none focus:bg-[#EEEDE9] dark:bg-neutral-800 dark:focus:bg-neutral-800 dark:focus:bg-neutral-800 transition-colors"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// RuleBuilder — P1-3 嵌套条件 DSL 编辑器
//
// 节点类型:
//   - 组合: { op: 'and' | 'or' | 'not', rules: BadgeCriteriaRule[] }
//   - 叶子: { type: BadgeCriteriaType, value?: number }
//
// 操作:
//   - 切换 op (select)
//   - 叶子编辑 type / value
//   - 组合加/删子规则
//   - 叶子转组合 / 组合转叶子(在根节点:整组重置)
// ──────────────────────────────────────────────────────────────────────

const OP_OPTIONS: { value: BadgeCriteriaOp; label: string }[] = [
  { value: 'and', label: 'AND（全部满足）' },
  { value: 'or', label: 'OR（任一满足）' },
  { value: 'not', label: 'NOT（全部不满足）' },
];

function isOpRule(r: BadgeCriteriaRule): r is BadgeCriteriaRule & { op: BadgeCriteriaOp; rules: BadgeCriteriaRule[] } {
  return !!r.op;
}

function emptyLeaf(): BadgeCriteriaRule {
  return { type: 'lessons_completed', value: 1 };
}

function RuleBuilder({
  rule,
  onChange,
  depth,
  courses,
}: {
  rule: BadgeCriteriaRule;
  onChange: (r: BadgeCriteriaRule) => void;
  depth: number;
  courses: Array<{ id: string; title: string; status: string }>;
}) {
  const [expanded, setExpanded] = useState(true);

  if (isOpRule(rule)) {
    // 组合节点
    return (
      <div
        className="border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 bg-white dark:bg-neutral-100 dark:bg-neutral-100"
        style={{ marginLeft: depth * 12 }}
      >
        <div className="flex items-center gap-2 p-2 bg-[#F5F4F0] dark:bg-neutral-800 dark:bg-neutral-800 border-b border-[#171717] dark:border-neutral-50 dark:border-neutral-50">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="p-0.5 hover:bg-[#EEEDE9] dark:bg-neutral-800 dark:hover:bg-neutral-800 dark:hover:bg-neutral-800"
          >
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
          <select
            value={rule.op}
            onChange={(e) =>
              onChange({ ...rule, op: e.target.value as BadgeCriteriaOp })
            }
            className="px-2 py-1 border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 text-xs font-black uppercase tracking-widest bg-white dark:bg-neutral-100 dark:bg-neutral-100"
          >
            {OP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-[#666666] dark:text-neutral-400 dark:text-neutral-400 font-mono">
            {rule.rules.length} 子规则
          </span>
          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...rule,
                  rules: [...rule.rules, emptyLeaf()],
                })
              }
              className="px-2 py-1 text-[10px] font-black uppercase tracking-widest border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 hover:bg-[#171717] hover:text-white transition-colors"
              title="加叶子"
            >
              + 叶子
            </button>
            <button
              type="button"
              onClick={() =>
                onChange({
                  ...rule,
                  rules: [...rule.rules, { op: 'and', rules: [] }],
                })
              }
              className="px-2 py-1 text-[10px] font-black uppercase tracking-widest border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 hover:bg-[#171717] hover:text-white transition-colors"
              title="加组合"
            >
              + 组合
            </button>
          </div>
        </div>
        {expanded && (
          <div className="p-2 space-y-2">
            {rule.rules.length === 0 && (
              <div className="text-[10px] text-[#A3A3A3] italic p-2">
                空组合(永远不达成) · 点上面 + 叶子 / + 组合 添加
              </div>
            )}
            {rule.rules.map((child, idx) => (
              <div key={idx} className="flex items-start gap-1">
                <div className="flex-1 min-w-0">
                  <RuleBuilder
                    rule={child}
                    depth={depth + 1}
                    courses={courses}
                    onChange={(r) => {
                      const next = [...rule.rules];
                      next[idx] = r;
                      onChange({ ...rule, rules: next });
                    }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const next = rule.rules.filter((_, i) => i !== idx);
                    onChange({ ...rule, rules: next });
                  }}
                  className="p-1 mt-1 text-[#A3A3A3] hover:text-[#171717] dark:text-neutral-50 dark:hover:text-neutral-50 hover:bg-[#EEEDE9] dark:bg-neutral-800 dark:hover:bg-neutral-800 dark:hover:bg-neutral-800"
                  title="删除"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // 叶子节点
  return (
    <div
      className="border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 bg-white dark:bg-neutral-100 dark:bg-neutral-100 p-2 flex items-center gap-2"
      style={{ marginLeft: depth * 12 }}
    >
      <span className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400 dark:text-neutral-400">
        叶子
      </span>
      <select
        value={rule.type ?? 'lessons_completed'}
        onChange={(e) =>
          onChange({ ...rule, type: e.target.value as BadgeCriteriaType })
        }
        className="flex-1 px-2 py-1 border border-[#171717] dark:border-neutral-50 dark:border-neutral-50 text-xs bg-white dark:bg-neutral-100 dark:bg-neutral-100 focus:outline-none focus:bg-[#EEEDE9] dark:bg-neutral-800 dark:focus:bg-neutral-800 dark:focus:bg-neutral-800"
      >
        {criteriaTypeOptions.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {rule.type === 'course_specific' ? (
        <select
          value={rule.courseId ?? ''}
          onChange={(e) => onChange({ ...rule, courseId: e.target.value, value: 1 })}
          className="min-w-0 flex-1 px-2 py-1 border border-[#171717] dark:border-neutral-50 text-xs bg-white dark:bg-neutral-100"
        >
          <option value="">— 选择课程 —</option>
          {courses.map((course) => (
            <option key={course.id} value={course.id}>
              {course.title}{course.status !== 'published' ? ' · 草稿' : ''}
            </option>
          ))}
        </select>
      ) : (
        <>
          <span className="text-[10px] font-black uppercase tracking-widest text-[#666666] dark:text-neutral-400">
            阈值
          </span>
          <input
            type="number"
            value={rule.value ?? 1}
            onChange={(e) => onChange({ ...rule, value: Number(e.target.value) })}
            className="w-20 px-2 py-1 border border-[#171717] dark:border-neutral-50 text-xs focus:outline-none focus:bg-[#EEEDE9] dark:focus:bg-neutral-800"
          />
        </>
      )}
    </div>
  );
}
