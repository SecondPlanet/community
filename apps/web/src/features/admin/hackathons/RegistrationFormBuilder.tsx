import { useState } from 'react';
import { ArrowDown, ArrowUp, Eye, Plus, Save, Trash2, Upload } from 'lucide-react';
import type { RegistrationField, RegistrationFieldType, RegistrationMode } from './types';
import { Field, Panel, Select, actionButtonClass, inputClass, outlineButtonClass } from './ui';

const FIELD_TYPES: Array<{ value: RegistrationFieldType; label: string }> = [
  { value: 'text', label: '单行文本' },
  { value: 'textarea', label: '多行文本' },
  { value: 'select', label: '单选' },
  { value: 'multiselect', label: '多选' },
  { value: 'number', label: '数字' },
  { value: 'url', label: '链接' },
  { value: 'file', label: '文件' },
];

export function validateRegistrationFields(fields: RegistrationField[]): string | null {
  if (fields.some((field) => !field.label.trim())) return '每个报名字段都需要填写名称';
  if (fields.some((field) => ['select', 'multiselect'].includes(field.type) && !field.options?.some((option) => option.trim()))) {
    return '单选和多选字段至少需要一个选项';
  }
  return null;
}

function newField(type: RegistrationFieldType): RegistrationField {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `field-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    label: '',
    type,
    required: false,
    ...(type === 'select' || type === 'multiselect' ? { options: [''] } : {}),
  };
}

export function RegistrationFormBuilder({
  mode,
  fields,
  registrationUrl,
  registrationLabel,
  saving,
  onModeChange,
  onFieldsChange,
  onUrlChange,
  onLabelChange,
  onSave,
}: {
  mode: RegistrationMode;
  fields: RegistrationField[];
  registrationUrl: string;
  registrationLabel: string;
  saving: boolean;
  onModeChange: (mode: RegistrationMode) => void;
  onFieldsChange: (fields: RegistrationField[]) => void;
  onUrlChange: (value: string) => void;
  onLabelChange: (value: string) => void;
  onSave: () => void;
}) {
  const [newType, setNewType] = useState<RegistrationFieldType>('text');
  const [preview, setPreview] = useState(false);

  const updateField = (id: string, patch: Partial<RegistrationField>) => {
    onFieldsChange(fields.map((field) => (field.id === id ? { ...field, ...patch } : field)));
  };

  const moveField = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const next = [...fields];
    [next[index], next[target]] = [next[target], next[index]];
    onFieldsChange(next);
  };

  return (
    <div className="space-y-6">
      <Panel title="报名方式">
        <div className="grid sm:grid-cols-2 gap-3">
          {(['internal', 'external'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onModeChange(value)}
              aria-pressed={mode === value}
              className={`p-4 text-left border-2 transition-colors ${
                mode === value ? 'border-[#171717] dark:border-[#3a3a38] bg-[#171717] text-white' : 'border-[#DAD8D0] hover:border-[#171717] dark:hover:border-[#3a3a38]'
              }`}
            >
              <span className="block text-sm font-black">{value === 'internal' ? '站内报名' : '外部链接'}</span>
              <span className={`block mt-1 text-xs ${mode === value ? 'text-neutral-300' : 'text-[#525252] dark:text-[#A8A6A0]'}`}>
                {value === 'internal' ? '使用下方自定义表单并在站内审核' : '跳转到第三方报名或活动页面'}
              </span>
            </button>
          ))}
        </div>
        {mode === 'external' && (
          <div className="grid sm:grid-cols-2 gap-4 mt-5">
            <Field label="外链 URL" value={registrationUrl} onChange={onUrlChange} placeholder="https://..." required />
            <Field label="按钮文案" value={registrationLabel} onChange={onLabelChange} placeholder="前往报名" />
          </div>
        )}
      </Panel>

      {mode === 'internal' && (
        <Panel
          title={`报名表字段 (${fields.length})`}
          action={
            <button type="button" onClick={() => setPreview(!preview)} className={outlineButtonClass}>
              <Eye className="w-3.5 h-3.5" /> {preview ? '返回编辑' : '预览表单'}
            </button>
          }
        >
          {preview ? (
            <RegistrationPreview fields={fields} />
          ) : (
            <>
              <div className="flex flex-col sm:flex-row gap-2 mb-5 pb-5 border-b border-[#EEEDE9] dark:border-[#2C2A26]">
                <select aria-label="新字段类型" value={newType} onChange={(event) => setNewType(event.target.value as RegistrationFieldType)} className={inputClass}>
                  {FIELD_TYPES.map((type) => <option key={type.value} value={type.value}>{type.label}</option>)}
                </select>
                <button type="button" onClick={() => onFieldsChange([...fields, newField(newType)])} className={actionButtonClass}>
                  <Plus className="w-4 h-4" /> 添加字段
                </button>
              </div>
              <div className="space-y-4">
                {fields.map((field, index) => (
                  <div key={field.id} className="border border-[#DAD8D0] p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0]">
                        {String(index + 1).padStart(2, '0')} / {FIELD_TYPES.find((type) => type.value === field.type)?.label}
                      </span>
                      <div className="flex gap-1">
                        <button type="button" aria-label={`上移 ${field.label || index + 1}`} title="上移" disabled={index === 0} onClick={() => moveField(index, -1)} className="p-2 border disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
                        <button type="button" aria-label={`下移 ${field.label || index + 1}`} title="下移" disabled={index === fields.length - 1} onClick={() => moveField(index, 1)} className="p-2 border disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
                        <button type="button" aria-label={`删除 ${field.label || index + 1}`} title="删除字段" onClick={() => { if (window.confirm(`确定删除字段「${field.label || index + 1}」吗？`)) onFieldsChange(fields.filter((item) => item.id !== field.id)); }} className="p-2 border text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-3">
                      <Field label="字段名称" value={field.label} onChange={(label) => updateField(field.id, { label })} required />
                      <Select label="字段类型" value={field.type} options={FIELD_TYPES} onChange={(type) => updateField(field.id, { type: type as RegistrationFieldType, ...(['select', 'multiselect'].includes(type) ? { options: field.options?.length ? field.options : [''] } : { options: undefined }) })} />
                      {field.type !== 'file' && <Field label="占位提示" value={field.placeholder ?? ''} onChange={(placeholder) => updateField(field.id, { placeholder: placeholder || undefined })} />}
                      {['text', 'textarea', 'url'].includes(field.type) && <Field label="最大长度" type="number" min={1} value={field.maxLength?.toString() ?? ''} onChange={(value) => updateField(field.id, { maxLength: value ? Number(value) : undefined })} />}
                    </div>
                    {['select', 'multiselect'].includes(field.type) && (
                      <Field label="选项（用逗号分隔）" value={field.options?.join(', ') ?? ''} onChange={(value) => updateField(field.id, { options: value.split(',').map((option) => option.trim()).filter(Boolean) })} required />
                    )}
                    <label className="inline-flex items-center gap-2 text-xs font-bold">
                      <input type="checkbox" checked={field.required} onChange={(event) => updateField(field.id, { required: event.target.checked })} className="w-4 h-4 accent-[#171717]" />
                      必填字段
                    </label>
                  </div>
                ))}
                {fields.length === 0 && <div className="py-10 text-center text-sm text-[#525252] dark:text-[#A8A6A0] border border-dashed">添加字段以收集报名资料；不添加则仅需账号信息。</div>}
              </div>
            </>
          )}
          <p className="mt-4 text-xs text-[#525252] dark:text-[#A8A6A0]">保存后，新报名使用当前字段顺序；历史报名保留提交时的表单快照。</p>
        </Panel>
      )}

      <button type="button" onClick={onSave} disabled={saving} className={actionButtonClass}>
        <Save className="w-4 h-4" /> {saving ? '保存中...' : '保存报名设置'}
      </button>
    </div>
  );
}

function RegistrationPreview({ fields }: { fields: RegistrationField[] }) {
  return (
    <div className="max-w-2xl border border-[#171717] p-5 bg-[#F5F4F0] dark:bg-[#0D0C0A]">
      <div className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0] mb-5">/ Application Preview</div>
      <div className="space-y-4">
        {fields.map((field) => {
          // 多选预览与学员端一致: 复选卡片(不是原生 multiple select)
          if (field.type === 'multiselect') {
            return (
              <fieldset key={field.id} className="block">
                <legend className="block mb-2 text-xs font-bold">
                  {field.label || '未命名字段'}{field.required && <span className="text-red-600"> *</span>}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {field.options?.map((option) => (
                    <label key={option} className="flex items-center gap-2 border border-[#D8D6CF] bg-white dark:bg-[#1A1916] px-3 py-2 text-sm">
                      <input type="checkbox" disabled />{option}
                    </label>
                  ))}
                </div>
              </fieldset>
            );
          }
          // 文件预览: 与学员端一致的附件上传按钮(不是浏览器原生文件控件)
          if (field.type === 'file') {
            return (
              <div key={field.id} className="block text-xs font-bold">
                <span className="block mb-2">
                  {field.label || '未命名字段'}{field.required && <span className="text-red-600"> *</span>}
                </span>
                <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#171717] text-white text-[10px] font-black uppercase tracking-widest">
                  <Upload className="w-3.5 h-3.5" /> 上传文件
                </span>
              </div>
            );
          }
          return (
            <label key={field.id} className="block text-xs font-bold">
              <span className="block mb-2">{field.label || '未命名字段'}{field.required && <span className="text-red-600"> *</span>}</span>
              {field.type === 'textarea' ? (
                <textarea placeholder={field.placeholder} maxLength={field.maxLength} className={inputClass} />
              ) : field.type === 'select' ? (
                <select className={inputClass} defaultValue="">
                  <option value="" disabled>{field.placeholder || '请选择'}</option>
                  {field.options?.map((option) => <option key={option} value={option}>{option}</option>)}
                </select>
              ) : (
                <input type={field.type === 'text' ? 'text' : field.type} placeholder={field.placeholder} maxLength={field.maxLength} className={inputClass} />
              )}
            </label>
          );
        })}
        {fields.length === 0 && <p className="text-sm text-[#525252] dark:text-[#A8A6A0]">当前仅收集登录用户的姓名和邮箱。</p>}
      </div>
    </div>
  );
}
