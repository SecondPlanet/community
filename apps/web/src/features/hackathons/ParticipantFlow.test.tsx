/**
 * ParticipantFlow — 参赛者流程测试
 * 关注:
 *   - RegistrationForm: 各字段类型渲染 / 必填与长度校验 / 报名 payload / 文件上传
 *   - TeamSection: 创建队伍 / 加入队伍 / 满员状态
 *   - SubmissionSection: 截止前新建草稿 / 截止后只读
 */
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HackathonFormField } from '@secondplanet/shared-types';
import { ToastProvider } from '../../components/auth/Toast';
import { hackathonsApi } from '../../lib/hackathonsApi';
import { uploadsApi } from '../../lib/uploadsApi';
import { useAuthStore } from '../../stores/authStore';
import { RegistrationForm } from './RegistrationFlow';
import { TeamSection } from './TeamSection';
import { SubmissionSection } from './SubmissionSection';

vi.mock('../../lib/hackathonsApi', () => ({
  hackathonsApi: {
    register: vi.fn(),
    cancelRegistration: vi.fn(),
    getMyRegistration: vi.fn(),
    getTeams: vi.fn(),
    createTeam: vi.fn(),
    joinTeam: vi.fn(),
    leaveTeam: vi.fn(),
    getMySubmissions: vi.fn(),
    createSubmission: vi.fn(),
    updateSubmission: vi.fn(),
    getSubmissionAttachmentUrl: vi.fn(),
    getRegistrationAttachmentUrl: vi.fn(),
  },
}));

vi.mock('../../lib/uploadsApi', () => ({
  uploadsApi: { upload: vi.fn() },
}));

const USER = { id: 'u1', email: 'u1@test.local', name: 'User One', role: 'student' as const };
const FUTURE = '2099-01-01T00:00:00Z';
const PAST = '2020-01-01T00:00:00Z';

const FIELDS: HackathonFormField[] = [
  { id: 'name', label: '姓名', type: 'text', required: true, placeholder: '你的名字' },
  { id: 'bio', label: '简介', type: 'textarea', required: false, maxLength: 100 },
  { id: 'track', label: '赛道', type: 'select', required: true, options: ['AI', 'Web'] },
  { id: 'skills', label: '技能', type: 'multiselect', required: true, options: ['JS', 'Go'] },
  { id: 'age', label: '年龄', type: 'number', required: false },
  { id: 'repo', label: '仓库', type: 'url', required: false },
];

function renderWithProviders(ui: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <ToastProvider>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </ToastProvider>,
  );
}

function submitRegistration() {
  fireEvent.submit(screen.getByRole('button', { name: '提交报名' }).closest('form')!);
}

beforeEach(() => {
  vi.resetAllMocks();
  useAuthStore.setState({ user: USER });
  vi.mocked(hackathonsApi.register).mockResolvedValue({} as never);
  vi.mocked(hackathonsApi.getMyRegistration).mockResolvedValue(null);
  vi.mocked(hackathonsApi.getTeams).mockResolvedValue([] as never);
  vi.mocked(hackathonsApi.getMySubmissions).mockResolvedValue([] as never);
});

describe('RegistrationForm', () => {
  it('按字段类型渲染 text/textarea/select/multiselect/number/url', () => {
    renderWithProviders(<RegistrationForm hackathonId="h1" fields={FIELDS} onSuccess={vi.fn()} />);

    expect(screen.getByLabelText(/姓名/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/姓名/)).toHaveAttribute('placeholder', '你的名字');
    expect(screen.getByLabelText(/简介/).tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText(/赛道/).tagName).toBe('SELECT');
    expect(screen.getByRole('checkbox', { name: 'JS' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Go' })).toBeInTheDocument();
    expect(screen.getByLabelText(/年龄/)).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText(/仓库/)).toHaveAttribute('type', 'url');
  });

  it('空表单提交时展示必填错误且不调用报名接口', () => {
    renderWithProviders(<RegistrationForm hackathonId="h1" fields={FIELDS} onSuccess={vi.fn()} />);

    submitRegistration();

    const alerts = screen.getAllByRole('alert').map((node) => node.textContent);
    expect(alerts).toEqual(expect.arrayContaining(['请填写姓名', '请填写赛道', '请填写技能']));
    expect(hackathonsApi.register).not.toHaveBeenCalled();
  });

  it('超过 maxLength 时展示长度错误', () => {
    const fields: HackathonFormField[] = [
      { id: 'bio', label: '简介', type: 'textarea', required: false, maxLength: 5 },
    ];
    renderWithProviders(<RegistrationForm hackathonId="h1" fields={fields} onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/简介/), { target: { value: '1234567' } });
    submitRegistration();

    expect(screen.getByRole('alert')).toHaveTextContent('最多输入 5 个字符');
    expect(hackathonsApi.register).not.toHaveBeenCalled();
  });

  it('提交时把填写的答案原样传给 register(id, { answers })', async () => {
    const onSuccess = vi.fn();
    renderWithProviders(<RegistrationForm hackathonId="h1" fields={FIELDS} onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText(/姓名/), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(/简介/), { target: { value: 'build things' } });
    fireEvent.change(screen.getByLabelText(/赛道/), { target: { value: 'AI' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'JS' }));
    fireEvent.change(screen.getByLabelText(/年龄/), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/仓库/), { target: { value: 'https://example.com' } });

    submitRegistration();

    await waitFor(() =>
      expect(hackathonsApi.register).toHaveBeenCalledWith('h1', {
        answers: {
          name: 'Alice',
          bio: 'build things',
          track: 'AI',
          skills: ['JS'],
          age: 3,
          repo: 'https://example.com',
        },
      }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it('文件上传成功后把元数据写入答案', async () => {
    const file = new File(['hello'], 'cv.pdf', { type: 'application/pdf' });
    vi.mocked(uploadsApi.upload).mockImplementation(async (opts) => {
      opts.onProgress?.({ loaded: 50, total: 100, percent: 50 });
      return {
        key: 'k1',
        name: opts.file.name,
        size: opts.file.size,
        mimeType: opts.file.type,
        writtenBack: true,
      };
    });
    const fields: HackathonFormField[] = [{ id: 'resume', label: '简历', type: 'file', required: true }];
    renderWithProviders(<RegistrationForm hackathonId="h1" fields={fields} onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/简历/), { target: { files: [file] } });

    await waitFor(() =>
      expect(uploadsApi.upload).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'hackathon-application-file', refId: 'h1', file }),
      ),
    );
    expect(await screen.findByText('cv.pdf')).toBeInTheDocument();

    submitRegistration();
    await waitFor(() =>
      expect(hackathonsApi.register).toHaveBeenCalledWith('h1', {
        answers: { resume: { key: 'k1', name: 'cv.pdf', size: 5, mimeType: 'application/pdf' } },
      }),
    );
  });

  it('上传失败后重试成功并写入答案', async () => {
    const file = new File(['hello'], 'cv.pdf', { type: 'application/pdf' });
    vi.mocked(uploadsApi.upload)
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce({ key: 'k2', name: 'cv.pdf', size: 5, mimeType: 'application/pdf', writtenBack: true });
    const fields: HackathonFormField[] = [{ id: 'resume', label: '简历', type: 'file', required: true }];
    renderWithProviders(<RegistrationForm hackathonId="h1" fields={fields} onSuccess={vi.fn()} />);

    fireEvent.change(screen.getByLabelText(/简历/), { target: { files: [file] } });
    // 错误文案统一中文, 不暴露英文原始错误
    expect(await screen.findByRole('alert')).toHaveTextContent('文件上传中断，请检查网络后重试');

    fireEvent.click(screen.getByRole('button', { name: /重试/ }));
    await waitFor(() => expect(uploadsApi.upload).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());

    submitRegistration();
    await waitFor(() =>
      expect(hackathonsApi.register).toHaveBeenCalledWith('h1', {
        answers: { resume: { key: 'k2', name: 'cv.pdf', size: 5, mimeType: 'application/pdf' } },
      }),
    );
  });
});

describe('TeamSection', () => {
  it('创建队伍时提交名称与口号', async () => {
    vi.mocked(hackathonsApi.createTeam).mockResolvedValue({} as never);
    renderWithProviders(<TeamSection hackathonId="h1" maxTeamSize={4} />);

    expect(await screen.findByText('还没有队伍，创建第一支队伍吧。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /创建队伍/ }));

    fireEvent.change(screen.getByLabelText(/队伍名称/), { target: { value: 'Alpha' } });
    fireEvent.change(screen.getByLabelText(/队伍口号/), { target: { value: 'Go fast' } });
    fireEvent.submit(screen.getByRole('button', { name: '确认创建' }).closest('form')!);

    await waitFor(() =>
      expect(hackathonsApi.createTeam).toHaveBeenCalledWith('h1', { name: 'Alpha', slogan: 'Go fast' }),
    );
    expect(await screen.findByText('队伍已创建')).toBeInTheDocument();
  });

  it('加入未满员队伍，满员队伍按钮禁用', async () => {
    vi.mocked(hackathonsApi.getTeams).mockResolvedValue([
      { id: 't1', hackathonId: 'h1', name: 'Alpha', memberCount: 1, captainId: 'u2', createdAt: PAST },
      { id: 't2', hackathonId: 'h1', name: 'Beta', memberCount: 4, captainId: 'u3', createdAt: PAST },
    ] as never);
    vi.mocked(hackathonsApi.joinTeam).mockResolvedValue({ message: 'ok' });
    renderWithProviders(<TeamSection hackathonId="h1" maxTeamSize={4} />);

    expect(await screen.findByText('Alpha')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '已满员' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '加入' }));
    await waitFor(() => expect(hackathonsApi.joinTeam).toHaveBeenCalledWith('h1', 't1'));
    expect(await screen.findByText('已加入队伍')).toBeInTheDocument();
  });
});

describe('SubmissionSection', () => {
  it('截止前新建草稿并保存标题与介绍', async () => {
    vi.mocked(hackathonsApi.createSubmission).mockResolvedValue({} as never);
    renderWithProviders(<SubmissionSection hackathonId="h1" deadline={FUTURE} />);

    expect(await screen.findByText('还没有作品草稿。')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /新建草稿/ }));

    fireEvent.change(screen.getByLabelText(/作品标题/), { target: { value: 'Demo' } });
    fireEvent.change(screen.getByLabelText(/作品介绍/), { target: { value: 'A small demo' } });
    fireEvent.submit(screen.getByRole('button', { name: '保存草稿' }).closest('form')!);

    await waitFor(() =>
      expect(hackathonsApi.createSubmission).toHaveBeenCalledWith(
        'h1',
        expect.objectContaining({ title: 'Demo', description: 'A small demo' }),
      ),
    );
    expect(await screen.findByText('作品草稿已保存')).toBeInTheDocument();
  });

  it('截止后作品为只读，不显示新建/编辑/提交按钮', async () => {
    vi.mocked(hackathonsApi.getMySubmissions).mockResolvedValue([
      {
        id: 's1',
        hackathonId: 'h1',
        title: 'Existing Draft',
        description: 'desc',
        status: 'draft',
        createdAt: PAST,
        updatedAt: PAST,
      },
    ] as never);
    renderWithProviders(<SubmissionSection hackathonId="h1" deadline={PAST} />);

    expect(await screen.findByText('Existing Draft')).toBeInTheDocument();
    expect(screen.getByText('提交已截止，作品现为只读状态。')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /新建草稿/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /编辑/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /提交作品/ })).toBeNull();
  });
});
