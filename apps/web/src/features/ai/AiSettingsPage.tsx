import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  KeyRound,
  Plus,
  Server,
  Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { QueryErrorState } from '../../components/QueryErrorState';
import { aiProviderApi, type AiProvider } from '../../lib/aiProviderApi';

const PROVIDERS: Array<{
  id: AiProvider;
  name: string;
  hint: string;
  defaultModel: string;
  baseUrl?: string;
}> = [
  {
    id: 'gemini',
    name: 'Google Gemini',
    hint: '适合轻量对话，支持 Gemini API Key',
    defaultModel: 'gemini-2.0-flash',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    hint: '支持 GPT 系列模型',
    defaultModel: 'gpt-4o-mini',
  },
  {
    id: 'claude',
    name: 'Anthropic Claude',
    hint: '支持 Claude 系列模型',
    defaultModel: 'claude-3-5-sonnet-latest',
  },
  {
    id: 'minimax',
    name: 'MiniMax（Anthropic API）',
    hint: '国内 Anthropic 兼容接口，支持 MiniMax-M3',
    defaultModel: 'MiniMax-M3',
    baseUrl: 'https://api.minimaxi.com/anthropic',
  },
  {
    id: 'openai-compatible',
    name: 'OpenAI 兼容接口',
    hint: 'DeepSeek、通义、硅基流动及自建网关',
    defaultModel: 'deepseek-chat',
    baseUrl: 'https://api.deepseek.com/v1',
  },
  {
    id: 'ollama',
    name: '本地 Ollama',
    hint: 'Key 可留空，适合本机模型',
    defaultModel: 'qwen2.5:7b',
    baseUrl: 'http://localhost:11434',
  },
];

export function AiSettingsPage() {
  const client = useQueryClient();
  const {
    data: configs = [],
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: ['ai-provider-configs'],
    queryFn: aiProviderApi.list,
  });
  const [selected, setSelected] = useState<AiProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('gpt-4o-mini');
  const [baseUrl, setBaseUrl] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const selectedMeta = useMemo(
    () => PROVIDERS.find((provider) => provider.id === selected)!,
    [selected],
  );
  const saved = configs.find((config) => config.provider === selected);

  useEffect(() => {
    if (isLoading) return;
    setModel(saved?.model || selectedMeta.defaultModel);
    setBaseUrl(saved?.baseUrl || selectedMeta.baseUrl || '');
  }, [isLoading, saved?.model, saved?.baseUrl, selectedMeta]);

  const save = useMutation({
    mutationFn: async () => {
      const savedConfig = await aiProviderApi.save({
        provider: selected,
        apiKey: apiKey || undefined,
        model,
        baseUrl,
        isActive: true,
      });
      const verification = await aiProviderApi.verify(selected);
      if (!verification.ok) {
        throw new Error(`配置已保存，但连接验证失败：${verification.error || '请检查 Key、模型与 Base URL'}`);
      }
      return savedConfig;
    },
    onSettled: async () => {
      setApiKey('');
      await client.invalidateQueries({ queryKey: ['ai-provider-configs'] });
    },
  });
  const remove = useMutation({
    mutationFn: () => aiProviderApi.remove(selected),
    onSuccess: async () => {
      setConfirmRemove(false);
      await client.invalidateQueries({ queryKey: ['ai-provider-configs'] });
    },
  });
  const busy = save.isPending || remove.isPending;

  function choose(provider: AiProvider) {
    const meta = PROVIDERS.find((item) => item.id === provider)!;
    const current = configs.find((config) => config.provider === provider);
    setSelected(provider);
    setModel(current?.model || meta.defaultModel);
    setBaseUrl(current?.baseUrl || meta.baseUrl || '');
    setApiKey('');
    setShowKey(false);
    save.reset();
    remove.reset();
  }

  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-8 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-900 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link
          to="/profile"
          className="mb-8 inline-flex min-h-11 items-center gap-2 text-sm text-neutral-600 transition-colors hover:text-neutral-900"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" />
          返回个人中心
        </Link>

        <div className="mb-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#171717] text-white">
              <KeyRound className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold">AI 助手设置</h1>
              <p className="mt-1 text-sm text-neutral-600">
                连接你自己的模型服务，Key 仅加密保存在你的账号下。
              </p>
            </div>
          </div>
        </div>

        {isError ? (
          <QueryErrorState
            error={error}
            onRetry={() => void refetch()}
            title="无法加载 AI 配置"
            description="请检查网络后重试。现有配置不会被更改。"
          />
        ) : (
          <div
            className="grid gap-5 lg:grid-cols-[280px_1fr]"
            aria-busy={isLoading || busy}
          >
            <section className="h-fit rounded-2xl border border-neutral-200 bg-neutral-0 p-3 dark:bg-neutral-100">
              <h2 className="px-3 py-2 text-xs font-medium uppercase tracking-wider text-neutral-600">
                接入方式
              </h2>
              {isLoading ? (
                <div role="status" className="px-3 py-8 text-center text-sm text-neutral-600">
                  正在加载配置…
                </div>
              ) : (
                PROVIDERS.map((provider) => {
                  const active = configs.some((config) => config.provider === provider.id);
                  const chosen = selected === provider.id;
                  return (
                    <button
                      key={provider.id}
                      type="button"
                      onClick={() => choose(provider.id)}
                      disabled={busy}
                      aria-pressed={chosen}
                      className={`flex w-full items-center gap-3 rounded-xl p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                        chosen
                          ? 'bg-[#171717] text-white'
                          : 'text-neutral-900 hover:bg-neutral-100 dark:hover:bg-neutral-200'
                      }`}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
                        <Server className="w-4 h-4" aria-hidden="true" />
                      </span>
                      <span className="flex-1">
                        <span className="block text-sm font-medium">{provider.name}</span>
                        <span
                          className={`mt-0.5 block text-xs ${
                            chosen ? 'text-neutral-300' : 'text-neutral-600'
                          }`}
                        >
                          {active ? '已配置' : '未配置'}
                        </span>
                      </span>
                      {active && (
                        <Check className="w-4 h-4 text-success-500" aria-label="已配置" />
                      )}
                    </button>
                  );
                })
              )}
            </section>

            <section className="rounded-2xl border border-neutral-200 bg-neutral-0 p-5 dark:bg-neutral-100 sm:p-7">
              <div className="mb-7 flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">{selectedMeta.name}</h2>
                  <p className="mt-1 text-sm text-neutral-600">{selectedMeta.hint}</p>
                </div>
                {saved && (
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs ${saved.verifiedAt ? 'bg-success-100 text-success-500' : 'bg-warning-100 text-warning-500'}`}>
                    {saved.verifiedAt ? '已连接' : '待验证'} · {saved.apiKeyMasked || '本地服务'}
                  </span>
                )}
              </div>

              <div className="space-y-5">
                {selected !== 'ollama' && (
                  <label className="block">
                    <span className="text-sm font-medium">
                      API Key{' '}
                      {saved && (
                        <span className="font-normal text-neutral-600">
                          （留空则保留当前 Key）
                        </span>
                      )}
                    </span>
                    <div className="relative mt-2">
                      <input
                        value={apiKey}
                        onChange={(event) => setApiKey(event.target.value)}
                        type={showKey ? 'text' : 'password'}
                        disabled={busy || isLoading}
                        placeholder={saved?.apiKeyMasked || '粘贴你的 API Key'}
                        className="w-full rounded-xl border border-neutral-200 bg-neutral-0 px-4 py-3 pr-11 text-sm text-neutral-900 outline-none focus:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                      />
                      <button
                        type="button"
                        onClick={() => setShowKey((visible) => !visible)}
                        disabled={busy || isLoading}
                        aria-label={showKey ? '隐藏 API Key' : '显示 API Key'}
                        className="absolute right-2 top-1/2 flex min-h-10 min-w-10 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-600 hover:bg-neutral-100 disabled:opacity-50"
                      >
                        {showKey ? (
                          <EyeOff className="w-4 h-4" aria-hidden="true" />
                        ) : (
                          <Eye className="w-4 h-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                  </label>
                )}

                <label className="block">
                  <span className="text-sm font-medium">模型名称</span>
                  <input
                    value={model}
                    onChange={(event) => setModel(event.target.value)}
                    disabled={busy || isLoading}
                    className="mt-2 w-full rounded-xl border border-neutral-200 bg-neutral-0 px-4 py-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder={selectedMeta.defaultModel}
                  />
                </label>

                <label className="block">
                  <span className="text-sm font-medium">
                    Base URL <span className="font-normal text-neutral-600">（可选）</span>
                  </span>
                  <input
                    value={baseUrl}
                    onChange={(event) => setBaseUrl(event.target.value)}
                    disabled={busy || isLoading}
                    className="mt-2 w-full rounded-xl border border-neutral-200 bg-neutral-0 px-4 py-3 text-sm text-neutral-900 outline-none focus:border-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder={selectedMeta.baseUrl || '使用官方默认地址'}
                  />
                </label>
              </div>

              <div className="mt-8 flex flex-col gap-4 border-t border-neutral-200 pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-sm text-xs text-neutral-600">
                  你的 Key 不会展示给平台管理员，也不会写入浏览器本地存储。发送消息时由服务端安全转发。
                </p>
                <div className="flex justify-end gap-2">
                  {saved && (
                    <button
                      type="button"
                      onClick={() => setConfirmRemove(true)}
                      disabled={busy || isLoading}
                      className="rounded-xl px-4 py-2.5 text-sm text-danger-500 hover:bg-danger-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="mr-1 inline w-4 h-4" aria-hidden="true" />
                      {remove.isPending ? '移除中…' : '移除'}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => save.mutate()}
                    disabled={busy || isLoading}
                    className="rounded-xl bg-[#171717] px-5 py-2.5 text-sm font-medium text-white hover:bg-[#262626] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Plus className="mr-1 inline w-4 h-4" aria-hidden="true" />
                    {save.isPending ? '保存中…' : '保存并启用'}
                  </button>
                </div>
              </div>

              {save.isError && (
                <p role="alert" className="mt-3 text-sm text-danger-500">
                  {save.error instanceof Error ? save.error.message : '保存或验证失败，请检查配置后重试。'}
                </p>
              )}
              {save.isSuccess && (
                <p role="status" className="mt-3 text-sm text-success-500">
                  已保存并验证，AI 助手下次对话将使用此配置。
                </p>
              )}
              {remove.isError && !confirmRemove && (
                <p role="alert" className="mt-3 text-sm text-danger-500">
                  移除失败，请稍后重试。
                </p>
              )}
            </section>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmRemove}
        onClose={() => {
          if (!remove.isPending) setConfirmRemove(false);
        }}
        onConfirm={() => remove.mutateAsync()}
        title={`移除 ${selectedMeta.name} 配置？`}
        description={
          remove.isError
            ? '移除失败，请检查网络后重试。现有配置仍然保留。'
            : '移除后，AI 助手将不再使用这项配置。此操作不会泄露或显示原 API Key。'
        }
        confirmText="确认移除"
        variant="danger"
      />
    </main>
  );
}
