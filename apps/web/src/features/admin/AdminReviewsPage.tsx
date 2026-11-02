/**
 * AdminReviewsPage — 全站评价管理
 *
 * 数据源:
 *   GET    /api/v1/reviews?page=&limit=&courseId=&rating=&onlyDeleted=
 *   DELETE /api/v1/reviews/:id
 *
 * 软删:content 置 [已删除], 保留 userId 用于追溯。
 * 列表展示评分、内容、用户、是否已软删、helpful 数、创建时间。
 */
import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { Star, Trash2, Search, Loader2, Eye, EyeOff } from 'lucide-react';
import { reviewsApi, type Review } from '../../lib/reviewsApi';

const PAGE_SIZE = 20;

export function AdminReviewsPage() {
  const queryClient = useQueryClient();
  const [ratingFilter, setRatingFilter] = useState<number | ''>('');
  const [courseIdFilter, setCourseIdFilter] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState<Review | null>(null);

  const queryParams = useMemo(
    () => ({
      page,
      limit: PAGE_SIZE,
      rating: ratingFilter === '' ? undefined : Number(ratingFilter),
      courseId: courseIdFilter || undefined,
      onlyDeleted: showDeleted,
    }),
    [page, ratingFilter, courseIdFilter, showDeleted],
  );

  const { data, isLoading, isError, error, isFetching } = useQuery({
    queryKey: ['admin-reviews', queryParams],
    queryFn: () => reviewsApi.listAll(queryParams),
    placeholderData: keepPreviousData,
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => reviewsApi.adminRemove(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reviews'] });
      setConfirming(null);
    },
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <div>
      <div className="mb-6">
        <div className="text-[10px] font-black uppercase tracking-[0.3em] text-[#666666] mb-2">
          / Admin · Reviews
        </div>
        <h2 className="text-3xl md:text-4xl font-black tracking-tighter uppercase">评价管理</h2>
        <p className="text-xs text-[#666666] mt-1">
          审核课程评价，删除操作仅管理员可执行，删除记录将保留追溯信息。
        </p>
      </div>

      {/* Filters */}
      <div className="border-2 border-[#171717] bg-white p-4 mb-4 flex flex-col md:flex-row gap-2">
        <div className="flex-1 flex items-center gap-2 px-3 border border-[#171717] focus-within:bg-[#EEEDE9]">
          <Search className="w-4 h-4 text-[#666666] shrink-0" />
          <input
            type="text"
            value={courseIdFilter}
            onChange={(e) => {
              setCourseIdFilter(e.target.value);
              setPage(1);
            }}
            placeholder="按 courseId 过滤"
            className="flex-1 py-2 bg-transparent text-sm focus:outline-none font-mono"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest text-[#666666]">
            评分
          </label>
          <select
            value={ratingFilter}
            onChange={(e) => {
              setRatingFilter(e.target.value === '' ? '' : Number(e.target.value));
              setPage(1);
            }}
            className="px-3 py-2 border border-[#171717] bg-white text-sm focus:outline-none focus:bg-[#EEEDE9]"
          >
            <option value="">全部</option>
            <option value="5">5 星</option>
            <option value="4">4 星</option>
            <option value="3">3 星</option>
            <option value="2">2 星</option>
            <option value="1">1 星</option>
          </select>
        </div>
        <button
          onClick={() => {
            setShowDeleted((s) => !s);
            setPage(1);
          }}
          className={`px-3 py-2 border border-[#171717] text-xs font-black uppercase tracking-widest inline-flex items-center gap-2 transition-colors ${
            showDeleted
              ? 'bg-[#171717] text-white'
              : 'bg-white text-[#171717] hover:bg-[#EEEDE9]'
          }`}
        >
          {showDeleted ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
          {showDeleted ? '显示全部' : '仅显示已删'}
        </button>
      </div>

      {/* Table */}
      <div className="border-2 border-[#171717] bg-white">
        <div className="hidden md:grid md:grid-cols-12 gap-4 p-4 border-b-2 border-[#171717] text-[10px] font-black uppercase tracking-widest text-[#666666]">
          <div className="col-span-2">用户 / 课程</div>
          <div className="col-span-1">评分</div>
          <div className="col-span-5">内容</div>
          <div className="col-span-1 text-center">Helpful</div>
          <div className="col-span-2">时间</div>
          <div className="col-span-1 text-right">操作</div>
        </div>

        {isLoading ? (
          <div className="p-16 text-center text-sm text-[#666666] flex flex-col items-center gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            加载中…
          </div>
        ) : isError ? (
          <div className="p-16 text-center text-sm text-red-600">
            加载失败：{(error as any)?.message ?? '未知错误'}
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="p-16 text-center text-sm text-[#666666]">暂无评价</div>
        ) : (
          data.items.map((r) => {
            const isDeleted = r.content === '[已删除]';
            return (
              <div
                key={r.id}
                className={`grid grid-cols-1 md:grid-cols-12 gap-2 md:gap-4 p-4 text-sm border-b border-[#EEEDE9] last:border-b-0 hover:bg-[#F5F4F0] transition-colors ${
                  isDeleted ? 'opacity-50' : ''
                }`}
              >
                <div className="col-span-12 md:col-span-2 min-w-0">
                  <div className="text-xs font-black truncate">{r.user.name}</div>
                  <div className="text-[10px] font-mono text-[#666666] truncate">
                    {r.userId.slice(0, 8)}… · {r.courseId.slice(0, 6)}…
                  </div>
                </div>
                <div className="col-span-12 md:col-span-1 flex items-center gap-0.5">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`w-3 h-3 ${
                        i < r.rating
                          ? 'fill-[#171717] text-[#171717]'
                          : 'text-[#A3A3A3]'
                      }`}
                    />
                  ))}
                </div>
                <div className="col-span-12 md:col-span-5 text-xs text-[#171717] leading-relaxed">
                  {isDeleted ? (
                    <span className="italic text-[#A3A3A3]">[已删除]</span>
                  ) : (
                    <span className="line-clamp-3">{r.content}</span>
                  )}
                </div>
                <div className="col-span-12 md:col-span-1 text-center text-xs font-mono">
                  {r.helpful}
                </div>
                <div className="col-span-12 md:col-span-2 text-[10px] font-mono text-[#666666]">
                  {new Date(r.createdAt).toLocaleString('zh-CN')}
                </div>
                <div className="col-span-12 md:col-span-1 flex items-center justify-end">
                  <button
                    onClick={() => setConfirming(r)}
                    disabled={isDeleted || removeMutation.isPending}
                    className="p-2 hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-30"
                    title={isDeleted ? '已删除' : '软删'}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {data && data.total > 0 && (
        <div className="flex items-center justify-between mt-4 text-xs">
          <div className="text-[#666666]">
            共 <span className="font-black text-[#171717]">{data.total}</span> 条 · 第{' '}
            <span className="font-black text-[#171717]">{page}</span> / {totalPages} 页
            {isFetching && <Loader2 className="w-3 h-3 inline ml-2 animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-2 border border-[#171717] font-black uppercase tracking-widest text-[10px] hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-30"
            >
              上一页
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="px-3 py-2 border border-[#171717] font-black uppercase tracking-widest text-[10px] hover:bg-[#171717] hover:text-white transition-colors disabled:opacity-30"
            >
              下一页
            </button>
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirming && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#171717] p-6 max-w-md w-full">
            <div className="text-[10px] font-black uppercase tracking-widest text-[#666666] mb-2">
              / Confirm Soft Delete
            </div>
            <h3 className="text-lg font-black tracking-tighter mb-2">确认软删这条评价？</h3>
            <p className="text-sm text-[#666666] mb-4">
              用户 <span className="font-black text-[#171717]">{confirming.user.name}</span>{' '}
              的评价将被置为「[已删除]」并隐藏，userId 保留用于追溯。
            </p>
            <div className="bg-[#F5F4F0] p-3 text-xs italic mb-4 line-clamp-3">
              {confirming.content}
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setConfirming(null)}
                className="px-4 py-2 border border-[#171717] text-[#171717] text-xs font-black uppercase tracking-widest hover:bg-[#EEEDE9] transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => removeMutation.mutate(confirming.id)}
                disabled={removeMutation.isPending}
                className="px-4 py-2 bg-[#171717] text-white text-xs font-black uppercase tracking-widest hover:bg-[#262626] transition-colors disabled:opacity-50"
              >
                {removeMutation.isPending ? '处理中…' : '确认软删'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
