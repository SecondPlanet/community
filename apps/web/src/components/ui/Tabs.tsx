/**
 * Tabs — P1-3 公共 Tabs 组件
 *
 * 解决 audit-frontend-perf-a11y-seo-i18n.md §2 的"5 个 tab 缺 role/aria-selected"问题。
 *
 * 行为:
 *   - 外层 div 拿 role="tablist",每项 button 拿 role="tab" + aria-selected
 *   - 键盘可达:左右方向键切换 tab,Home/End 跳首尾(标准 ARIA Authoring Practices)
 *   - 视觉:不写死颜色,接 className prop 让各页覆盖 (brutalist 硬边 / dashboard 柔和都可)
 *   - 内容面板用 aria-labelledby 关联选中 tab id
 *
 * 用法:
 *   const [tab, setTab] = useState<TabKey>('overview');
 *   <Tabs
 *     value={tab}
 *     onChange={setTab}
 *     ariaLabel="课程详情"
 *     items={[
 *       { key: 'overview', label: '课程概览', icon: BookOpen },
 *       { key: 'video',    label: '视频课程', icon: PlayCircle },
 *     ]}
 *   />
 *   <TabPanel value={tab} tabKey="overview" id="tab-overview">...</TabPanel>
 */
import { useId, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface TabItem<T extends string> {
  key: T;
  label: ReactNode;
  /** 可选:在 label 前面渲染的图标组件 (lucide-react 图标) */
  icon?: React.ComponentType<{ className?: string }>;
  /** 可选:禁用该 tab */
  disabled?: boolean;
}

export interface TabsProps<T extends string> {
  /** 当前选中 key */
  value: T;
  /** 切换回调 */
  onChange: (key: T) => void;
  /** tab 项 */
  items: ReadonlyArray<TabItem<T>>;
  /** tablist 的 aria-label, 屏读用户能听出"这是 XX 的 tab 组" */
  ariaLabel: string;
  /**
   * 可选:每项额外 className。
   * 既可以是 string (所有 tab 共用),也可以是 function (item + active 状态,用于动态样式)。
   * 例:'(item) => item.disabled ? "opacity-50" : ""'
   */
  itemClassName?: string | ((item: TabItem<T>, active: boolean) => string);
  /** 可选:整体 className,例如 'bg-white sticky top-16 z-40' */
  className?: string;
  /** 可选:id 前缀(用于 aria-controls 关联 TabPanel),默认 useId() */
  idPrefix?: string;
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  ariaLabel,
  itemClassName,
  className,
  idPrefix,
}: TabsProps<T>) {
  const autoId = useId();
  const prefix = idPrefix ?? autoId;
  // 用 ref 数组保存所有 tab button,键盘事件时 focus 切换
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const enabledIdx = items
      .map((it, i) => ({ it, i }))
      .filter(({ it }) => !it.disabled);
    if (enabledIdx.length === 0) return;
    const currentIdx = items.findIndex((it) => it.key === value);
    const currentEnabledPos = enabledIdx.findIndex(({ i }) => i === currentIdx);

    let nextPos = currentEnabledPos;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextPos = (currentEnabledPos + 1) % enabledIdx.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextPos = (currentEnabledPos - 1 + enabledIdx.length) % enabledIdx.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextPos = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextPos = enabledIdx.length - 1;
    } else {
      return;
    }
    const target = enabledIdx[nextPos];
    if (target) {
      onChange(target.it.key);
      // 下一帧 focus,让 onChange 先 setState 渲染
      requestAnimationFrame(() => {
        buttonRefs.current[target.i]?.focus();
      });
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={className}
    >
      {items.map((item, i) => {
        const selected = value === item.key;
        const tabId = `${prefix}-tab-${item.key}`;
        const panelId = `${prefix}-panel-${item.key}`;
        const Icon = item.icon;
        const itemCls =
          typeof itemClassName === 'function'
            ? itemClassName(item, selected)
            : itemClassName;
        return (
          <button
            key={item.key}
            ref={(el) => {
              buttonRefs.current[i] = el;
            }}
            id={tabId}
            role="tab"
            type="button"
            aria-selected={selected}
            aria-controls={panelId}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.key)}
            className={cn(itemCls)}
          >
            {Icon ? <Icon className="w-4 h-4" /> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * TabPanel — 与 Tabs 配合,渲染当前激活的内容面板
 *
 * 用法:
 *   <TabPanel value={tab} tabKey="overview" idPrefix={prefix}>...</TabPanel>
 *
 * 非激活面板加 hidden,避免屏读重复读;激活面板加 role/aria-labelledby。
 *
 * 非激活时是否保留挂载由 keepMounted 决定(默认 false,卸载):
 *  - false: 非激活面板卸载,组件内 state 丢失。适合"切走必须停掉副作用"的面板
 *    (如课程详情页视频 tab,切走即停止播放)。
 *  - true: 非激活面板保留挂载、hidden 隐藏,state(query 游标/窗口选择/编辑内容)
 *    在 tab 切换后不丢失,切回时无需重新加载。代价是面板上的请求在首次进入页面
 *    时就发起。按需启用。
 */
export interface TabPanelProps {
  /** 当前 tab key (从父组件传入) */
  value: string;
  /** 本 panel 自己的 tab key */
  tabKey: string;
  /** id 前缀,跟 Tabs 的 idPrefix 一致 */
  idPrefix: string;
  children: ReactNode;
  className?: string;
  /** 非激活时是否保留挂载(默认 false = 卸载)。见上方说明。 */
  keepMounted?: boolean;
}

export function TabPanel({ value, tabKey, idPrefix, children, className, keepMounted = false }: TabPanelProps) {
  const tabId = `${idPrefix}-tab-${tabKey}`;
  const panelId = `${idPrefix}-panel-${tabKey}`;
  const selected = value === tabKey;
  if (!selected) {
    return (
      <div
        id={panelId}
        role="tabpanel"
        aria-labelledby={tabId}
        hidden
        className={className}
      >
        {keepMounted ? children : null}
      </div>
    );
  }
  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      className={className}
    >
      {children}
    </div>
  );
}
