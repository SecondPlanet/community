import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Users } from 'lucide-react';
import { hackathonsApi } from '../../lib/hackathonsApi';
import { useApiMutation } from '../../hooks/useApiMutation';
import { useAuthStore } from '../../stores/authStore';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { participantApi, type ParticipantTeam } from './participantApi';

export function TeamSection({ hackathonId, maxTeamSize }: { hackathonId: string; maxTeamSize: number }) {
  const user = useAuthStore((state) => state.user);
  const [creating, setCreating] = useState(false);
  const [leaving, setLeaving] = useState<ParticipantTeam | null>(null);
  const { data: teams = [], isLoading } = useQuery({
    queryKey: ['hackathon-teams', hackathonId],
    queryFn: () => participantApi.getTeams(hackathonId),
  });
  const invalidateKeys = [['hackathon-teams', hackathonId], ['hackathon', hackathonId]];
  const createMutation = useApiMutation({
    mutationFn: (payload: { name: string; slogan?: string }) => hackathonsApi.createTeam(hackathonId, payload),
    successMessage: '队伍已创建',
    invalidateKeys,
    onSuccess: () => setCreating(false),
  });
  const joinMutation = useApiMutation({
    mutationFn: (teamId: string) => hackathonsApi.joinTeam(hackathonId, teamId),
    successMessage: '已加入队伍',
    invalidateKeys,
  });
  const leaveMutation = useApiMutation({
    mutationFn: (teamId: string) => hackathonsApi.leaveTeam(hackathonId, teamId),
    successMessage: '已退出队伍',
    invalidateKeys,
  });

  const myTeam = teams.find((team) => team.captainId === user?.id || team.members?.some((member) => member.userId === user?.id));
  const otherTeams = teams.filter((team) => team.id !== myTeam?.id);

  const copyInvite = async () => {
    if (!myTeam) return;
    // 邀请链接: 队友打开后详情页读取 joinTeam 参数自动调用加入 API(无需新增后端)
    const link = `${window.location.origin}/hackathons/${hackathonId}?joinTeam=${myTeam.id}`;
    try {
      await navigator.clipboard.writeText(link);
      window.alert('邀请链接已复制，发送给队友即可加入');
    } catch {
      window.prompt('复制以下邀请链接发送给队友：', link);
    }
  };

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const name = String(data.get('name') || '').trim();
    const slogan = String(data.get('slogan') || '').trim();
    if (name) createMutation.mutate({ name, slogan: slogan || undefined });
  };

  return (
    <section className="border-2 border-[#171717] bg-white dark:bg-[#1A1916]" aria-labelledby="team-section-title">
      <div className="flex items-center justify-between gap-4 border-b-2 border-[#171717] dark:border-[#3a3a38] p-5">
        <div>
          <div className="text-[10px] font-black uppercase tracking-[0.25em] text-[#525252] dark:text-[#A8A6A0]">/ Team</div>
          <h2 id="team-section-title" className="mt-1 text-xl font-black tracking-tight">我的队伍</h2>
        </div>
        {!myTeam && <Button size="sm" onClick={() => setCreating((value) => !value)}><Plus className="w-4 h-4" /> 创建队伍</Button>}
      </div>
      <div className="p-5">
        {myTeam && (
          <div className="mb-5 border-2 border-[#171717] bg-[#F0EEE8] dark:bg-[#1A1916] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0]">已加入</div>
                <h3 className="mt-1 text-lg font-black">{myTeam.name}</h3>
                {myTeam.slogan && <p className="mt-1 text-xs text-[#525252] dark:text-[#A8A6A0]">{myTeam.slogan}</p>}
              </div>
              <div className="flex flex-wrap gap-2">
                {myTeam.captainId === user?.id && (
                  <Button size="sm" variant="secondary" onClick={copyInvite}>邀请成员</Button>
                )}
                <Button size="sm" variant="secondary" onClick={() => setLeaving(myTeam)}>退出队伍</Button>
              </div>
            </div>
            <TeamMembers team={myTeam} maxTeamSize={maxTeamSize} />
          </div>
        )}

        {creating && !myTeam && (
          <form onSubmit={create} className="mb-5 grid gap-3 border border-[#171717] bg-[#F5F4F0] dark:bg-[#0D0C0A] p-4 sm:grid-cols-2">
            <label className="text-xs font-bold">队伍名称 *
              <input name="name" required maxLength={60} className="mt-1 w-full border border-[#A9A79F] bg-white dark:bg-[#1A1916] px-3 py-2 text-sm" />
            </label>
            <label className="text-xs font-bold">队伍口号
              <input name="slogan" maxLength={120} className="mt-1 w-full border border-[#A9A79F] bg-white dark:bg-[#1A1916] px-3 py-2 text-sm" />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <Button type="submit" size="sm" isLoading={createMutation.isPending}>确认创建</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setCreating(false)}>取消</Button>
            </div>
          </form>
        )}

        <h3 className="mb-3 text-xs font-black uppercase tracking-widest text-[#525252] dark:text-[#A8A6A0]">全部队伍 · {otherTeams.length}</h3>
        {isLoading ? <p className="text-sm text-[#525252] dark:text-[#A8A6A0]">加载队伍中…</p> : otherTeams.length === 0 ? (
          <div className="border border-dashed border-[#A9A79F] p-6 text-center text-sm text-[#525252] dark:text-[#A8A6A0]">{myTeam ? '暂无其他队伍。' : '还没有队伍，创建第一支队伍吧。'}</div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {otherTeams.map((team) => {
              const count = team.memberCount ?? team.members?.length ?? 0;
              return (
                <article key={team.id} className="border border-[#D8D6CF] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h4 className="truncate font-black">{team.name}</h4>
                      {team.slogan && <p className="mt-1 line-clamp-2 text-xs text-[#525252] dark:text-[#A8A6A0]">{team.slogan}</p>}
                    </div>
                    {!myTeam && (
                      <Button size="sm" variant="secondary" disabled={count >= maxTeamSize || joinMutation.isPending} onClick={() => joinMutation.mutate(team.id)}>
                        {count >= maxTeamSize ? '已满员' : '加入'}
                      </Button>
                    )}
                  </div>
                  <TeamMembers team={team} maxTeamSize={maxTeamSize} compact />
                </article>
              );
            })}
          </div>
        )}
      </div>
      <ConfirmDialog
        open={!!leaving}
        onClose={() => setLeaving(null)}
        onConfirm={() => leaveMutation.mutateAsync(leaving!.id).then(() => undefined)}
        title={`退出 ${leaving?.name ?? '队伍'}？`}
        description="退出后需要重新加入队伍；队伍作品不会被自动删除。"
        confirmText="确认退出"
      />
    </section>
  );
}

function TeamMembers({ team, maxTeamSize, compact = false }: { team: ParticipantTeam; maxTeamSize: number; compact?: boolean }) {
  const count = team.memberCount ?? team.members?.length ?? 0;
  return (
    <div className="mt-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-[#525252] dark:text-[#A8A6A0]"><Users className="w-3.5 h-3.5" /> {count} / {maxTeamSize} 人</div>
      {!compact && !!team.members?.length && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {team.members.map((member) => <li key={member.id} className="border border-[#D8D6CF] bg-white dark:bg-[#1A1916] px-2 py-1 text-xs">{member.userName || '参赛成员'}{member.role === 'captain' ? ' · 队长' : ''}</li>)}
        </ul>
      )}
    </div>
  );
}
