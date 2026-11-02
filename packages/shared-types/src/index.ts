// ==================== Common Types ====================

export * from './ai-personal-courses';
// Keep runtime schemas as explicit exports. Vite's CommonJS interop cannot
// reliably discover names that TypeScript emits through __exportStar.
export {
  EditableCoursePlanSchema,
  LearningPreferencesSchema,
  type EditableCoursePlan,
} from './ai-personal-course-schema';

export type CostType = 'free' | 'paid' | 'charity';

export type CourseLevel = 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';

export type UserRole = 'admin' | 'student' | 'instructor';

export type CourseStatus = 'draft' | 'published' | 'archived';

export type ResourceType = 'pdf' | 'code' | 'link' | 'video' | 'audio';

export type OrderStatus = 'pending' | 'paid' | 'failed' | 'expired' | 'refunded';

export type OrderType = 'course' | 'degree';

// P2-2: 支付方式 (新加, 从 Order.paymentMethod String 升级为 enum)
export type PaymentMethod = 'wechat' | 'alipay' | 'stripe';

export type EnrollmentSource = 'direct' | 'degree' | 'hackathon' | 'promotion' | 'order';

export type ProgressStatus = 'not_started' | 'in_progress' | 'completed';

export type HackathonStatus = 'upcoming' | 'active' | 'judging' | 'finished' | 'cancelled';

export type RegistrationStatus = 'registered' | 'cancelled' | 'checked_in';

export type TeamRole = 'captain' | 'member';

export type SubmissionStatus = 'draft' | 'submitted' | 'under_review' | 'shortlisted' | 'winner' | 'rejected';

export type ProjectDifficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export type ProjectType =
  | 'model_deployment'
  | 'model_training'
  | 'model_inference'
  | 'api_integration'
  | 'notebook'
  | 'sandbox'
  | 'repository'
  | 'csghub_space';

export type CompletionStatus = 'in_progress' | 'completed' | 'skipped';

// P2-2: 6 个新 enum (CertificateType 已在 P1-8 处定义)
// 通知类型
export type NotificationType = 'announcement' | 'comment' | 'hackathon' | 'order';
// AI 聊天角色
export type ChatMessageRole = 'user' | 'assistant' | 'system';
// 学习事件类型
export type LearningEventType = 'play' | 'pause' | 'seek' | 'complete' | 'replay' | 'skip' | 'note';
// 积分流水关联类型
export type PointRefType = 'lesson' | 'practice' | 'badge' | 'enrollment';
// i18n 分类
export type I18nMessageCategory = 'common' | 'auth' | 'course' | 'hackathon' | 'degree' | 'admin';

export type BadgeCriteriaType =
  | 'course_completed'
  | 'lessons_completed'
  | 'streak_days'
  | 'first_enrollment'
  | 'practice_completed'
  | 'points_reached'
  | 'course_specific'; // P1 修复(2026-07-24): 完成指定 courseId 课程

/**
 * 徽章嵌套条件 DSL(P1-3):
 *   叶子: { type: BadgeCriteriaType, value?: number }   // value 缺省 = 1
 *   组合: { op: 'and' | 'or' | 'not', rules: BadgeCriteriaRule[] }
 *
 * 后端 BadgesService.evaluateCriteria 会按 op 递归评估;
 * 旧版 criteriaType + criteriaValue 仍兼容(criteriaJson 优先)。
 */
export type BadgeCriteriaOp = 'and' | 'or' | 'not';

export interface BadgeCriteriaLeaf {
  type: BadgeCriteriaType;
  value?: number;
  // P1 修复(2026-07-24): 叶子节点可附 courseId (course_specific 用)
  courseId?: string;
}

export interface BadgeCriteriaRule {
  op?: BadgeCriteriaOp;
  rules?: BadgeCriteriaRule[];
  type?: BadgeCriteriaType;
  value?: number;
  courseId?: string;
}

// ==================== Entity Interfaces ====================

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  avatarUrl?: string;
  passwordResetRequired: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
  lastLoginAt?: Date | string | null;
}

export interface Course {
  id: string;
  title: string;
  description: string;
  learningPoints: string;
  instructor: string;
  instructorId?: string | null;
  level: CourseLevel;
  duration: string;
  thumbnail: string;
  tags: string;
  costType: CostType;
  price: number;
  status: CourseStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Chapter {
  id: string;
  courseId: string;
  title: string;
  description?: string | null;
  orderIndex: number;
  createdAt: Date | string;
}

export interface Lesson {
  id: string;
  chapterId: string;
  title: string;
  description?: string | null;
  videoUrl?: string | null;
  videoDuration?: number | null;
  orderIndex: number;
  isPreview: boolean;
  estimatedMinutes?: number;
  isHidden?: boolean;
  deletedAt?: Date | string | null;
  createdAt: Date | string;
}

export interface Resource {
  id: string;
  lessonId: string;
  title: string;
  url: string;
  type: ResourceType;
  isLocked: boolean;
  createdAt: Date | string;
}

export interface NanoDegree {
  id: string;
  title: string;
  description: string;
  learningPoints: string;
  price: number;
  icon: string;
  costType: CostType;
  thumbnail?: string | null;
  status: CourseStatus;
  createdAt: Date | string;
  updatedAt: Date | string;
}

/** 学习路径上的单门课程（带步骤序号、统计） */
export interface DegreePathCourse {
  id: string;
  title: string;
  description: string;
  thumbnail: string;
  level: CourseLevel;
  duration: string;
  instructor: string;
  tags: string;
  costType: CostType;
  price: number;
  orderIndex: number;
  stepNumber: number;
  /** 课程内的模块数量（后端仍以 chapter 存储，展示层不再称为章节） */
  moduleCount: number;
  lessonCount: number;
  /** @deprecated 展示层请使用 moduleCount */
  chapterCount?: number;
  learnerCount: number;
}

/** 学位的学习路径统计 */
export interface DegreeStats {
  courseCount: number;
  totalLessons: number;
  /** @deprecated 展示层请使用 totalLessons */
  totalChapters?: number;
  totalLearners: number;
  estimatedHours: number;
}

/** 学位详情（学习路径式） */
export interface NanoDegreeWithPath extends NanoDegree {
  courses: DegreePathCourse[];
  stats: DegreeStats;
}

/** 订单中关联的课程/学位摘要 */
export interface OrderItemRef {
  id: string;
  title: string;
  thumbnail?: string | null;
  // P1-8 起包含更多字段(便于订单页直接展示)
  level?: CourseLevel;
  costType?: CostType;
  price?: number;
}

export interface OrderWithItems extends Order {
  course?: OrderItemRef | null;
  degree?: OrderItemRef | null;
}

/** 创建订单请求 */
export interface CreateOrderRequest {
  type: OrderType;
  courseId?: string;
  degreeId?: string;
  paymentMethod?: string;
}

/** Mock 支付请求 */
export interface MockPayRequest {
  paymentMethod?: string;
}

/** 退款请求 (P1-8 新增) */
export interface RefundOrderRequest {
  reason?: string;
}

/** 创建订单响应（免费品会直接注册并返回 enrollment） */
export interface CreateOrderResponse {
  enrolled: boolean;
  enrollment?: Enrollment;
  order?: OrderWithItems;
}

export interface DegreeCourse {
  degreeId: string;
  courseId: string;
  orderIndex: number;
}

export interface Enrollment {
  id: string;
  userId: string;
  courseId?: string | null;
  degreeId?: string | null;
  enrolledAt: Date | string;
  expiresAt?: Date | string | null;
  source: EnrollmentSource;
}

export interface Order {
  id: string;
  userId: string;
  type: OrderType;
  courseId?: string | null;
  degreeId?: string | null;
  amount: number;
  currency: string;
  status: OrderStatus;
  paymentMethod?: string | null;
  transactionId?: string | null;
  paidAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface ProgressRecord {
  id: string;
  userId: string;
  courseId: string;
  lessonId: string;
  status: ProgressStatus;
  completedAt?: Date | string | null;
  lastPosition?: number | null;
  updatedAt: Date | string;
}

export type RegistrationMode = 'internal' | 'external';
export type ReviewStatus = 'pending' | 'approved' | 'waitlisted' | 'rejected';
export type HackathonFormFieldType = 'text' | 'textarea' | 'select' | 'multiselect' | 'number' | 'url' | 'file';

export interface HackathonFormField {
  id: string;
  label: string;
  type: HackathonFormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
  maxLength?: number;
}

export interface UploadedFileMeta {
  key: string;
  name: string;
  size: number;
  mimeType: string;
  /** 服务端盖章的上传者 id; 客户端不应自行填写 */
  uploadedBy?: string;
}

export interface Hackathon {
  id: string;
  title: string;
  description: string;
  bannerUrl?: string | null;
  status: HackathonStatus;
  startDate: Date | string;
  endDate: Date | string;
  registerDeadline?: Date | string | null;
  submissionDeadline?: Date | string | null;
  maxTeamSize: number;
  minTeamSize: number;
  location?: string | null;
  rules?: string | null;
  submissionRequirements?: string | null;
  prizes?: string | null;
  organizerId?: string | null;
  registrationUrl?: string | null;
  registrationLabel?: string | null;
  registrationMode: RegistrationMode;
  registrationFields?: HackathonFormField[] | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface HackathonRegistration {
  id: string;
  hackathonId: string;
  userId: string;
  status: RegistrationStatus;
  registeredAt: Date | string;
  checkedInAt?: Date | string | null;
  answers?: Record<string, unknown> | null;
  formSnapshot?: HackathonFormField[] | null;
  reviewStatus: ReviewStatus;
  reviewNote?: string | null;
  reviewedAt?: Date | string | null;
  reviewedById?: string | null;
  user?: { id: string; name: string; email: string };
}

export interface Team {
  id: string;
  hackathonId: string;
  name: string;
  slogan?: string | null;
  captainId: string;
  createdAt: Date | string;
}

export interface TeamMember {
  id: string;
  teamId: string;
  userId: string;
  role: TeamRole;
}

export interface Judge {
  id: string;
  hackathonId: string;
  userId?: string | null;
  name: string;
  title?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
}

export interface Submission {
  id: string;
  hackathonId: string;
  teamId?: string | null;
  userId?: string | null;
  title: string;
  description: string;
  demoUrl?: string | null;
  repoUrl?: string | null;
  videoUrl?: string | null;
  attachments?: UploadedFileMeta[] | null;
  status: SubmissionStatus;
  score?: number | null;
  feedback?: string | null;
  submittedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface Announcement {
  id: string;
  hackathonId: string;
  title: string;
  content: string;
  isPinned: boolean;
  createdAt: Date | string;
}

// ==================== 实践项目 ====================

export interface PracticeProject {
  id: string;
  courseId: string;
  title: string;
  description: string;
  projectUrl: string;
  thumbnailUrl?: string | null;
  difficulty: ProjectDifficulty;
  estimatedTime: number;
  tags?: string | null;
  projectType: ProjectType;
  orderIndex: number;
  requirements?: string | null;
  objectives?: string | null;
  isActive: boolean;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface PracticeCompletion {
  id: string;
  userId: string;
  projectId: string;
  status: CompletionStatus;
  startedAt: Date | string;
  completedAt?: Date | string | null;
  submissionUrl?: string | null;
  notes?: string | null;
}

// ==================== API Request/Response DTOs ====================

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  accessToken: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  name: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface CreateCourseRequest {
  title: string;
  description: string;
  learningPoints: string;
  instructor: string;
  level: CourseLevel;
  duration: string;
  thumbnail: string;
  tags: string;
  costType: CostType;
  price: number;
  status?: CourseStatus;
}

export interface UpdateCourseRequest extends Partial<CreateCourseRequest> {}

export interface CreateDegreeRequest {
  title: string;
  description: string;
  learningPoints: string;
  price: number;
  icon: string;
  costType: CostType;
  thumbnail?: string;
  status?: CourseStatus;
}

export interface UpdateDegreeRequest extends Partial<CreateDegreeRequest> {}

export interface CreatePracticeProjectRequest {
  courseId: string;
  title: string;
  description: string;
  projectUrl: string;
  thumbnailUrl?: string;
  difficulty: ProjectDifficulty;
  estimatedTime: number;
  tags?: string;
  projectType: ProjectType;
  orderIndex?: number;
  requirements?: string;
  objectives?: string;
  isActive?: boolean;
}

export interface UpdatePracticeProjectRequest extends Partial<CreatePracticeProjectRequest> {}

export interface StartPracticeRequest {
  projectId: string;
}

export interface CompletePracticeRequest {
  submissionUrl?: string;
  notes?: string;
}

// ==================== 游戏化：徽章 / 积分 / 进度 ====================

export interface Badge {
  id: string;
  code: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  criteriaType: BadgeCriteriaType;
  criteriaValue: number;
  /** P1-3 嵌套规则 — 优先于 criteriaType + criteriaValue */
  criteriaJson?: BadgeCriteriaRule | null;
  points: number;
  isActive: boolean;
  orderIndex: number;
  createdAt: Date | string;
  updatedAt: Date | string;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  unlockedAt: Date | string;
  badge?: Badge;
}

/** 徽章 + 当前用户解锁状态与进度（用于徽章墙展示） */
export interface BadgeWithStatus extends Badge {
  unlocked: boolean;
  unlockedAt?: Date | string | null;
  progress: number; // 已达成量
  target: number; // 目标量（= criteriaValue）
}

export interface PointTransaction {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  refType?: string | null;
  refId?: string | null;
  createdAt: Date | string;
}

/** 当前用户积分与等级概要 */
export interface UserPoints {
  points: number;
  level: number;
  currentLevelPoints: number; // 当前等级起点积分
  nextLevelPoints: number; // 下一等级所需积分
  pointsToNextLevel: number; // 距升级还差多少
  recentTransactions: PointTransaction[];
}

/** 单门课程的学习进度 */
export interface CourseProgress {
  courseId: string;
  totalLessons: number;
  completedLessons: number;
  percent: number; // 0-100
  isCompleted: boolean;
}

/** 个人中心仪表盘统计 */
export interface LearningStats {
  totalCompletedLessons: number;
  weekCompletedLessons: number;
  streakDays: number; // 连续学习天数
  longestStreak: number;
  /** 按天的活动量，用于热力图 */
  activity: { date: string; count: number }[];
}

export interface CreateBadgeRequest {
  code: string;
  name: string;
  description: string;
  icon?: string;
  category?: string;
  criteriaType: BadgeCriteriaType;
  criteriaValue?: number;
  /** P1-3 嵌套规则 — 优先于 criteriaType + criteriaValue */
  criteriaJson?: BadgeCriteriaRule | null;
  points?: number;
  isActive?: boolean;
  orderIndex?: number;
}

export interface UpdateBadgeRequest extends Partial<CreateBadgeRequest> {}

/** 管理员数据看板 */
export interface AdminGamificationStats {
  totalUsers: number;
  activeUsers7d: number; // 近7天有学习活动的用户
  totalLessonsCompleted: number;
  totalBadgesUnlocked: number;
  badgeDistribution: { badgeId: string; name: string; icon: string; count: number }[];
  leaderboard: { userId: string; name: string; points: number; level: number }[];
}

// ==================== 黑客松 DTOs ====================

export interface CreateHackathonRequest {
  title: string;
  description: string;
  bannerUrl?: string;
  status?: HackathonStatus;
  startDate: Date | string;
  endDate: Date | string;
  registerDeadline?: Date | string | null;
  submissionDeadline?: Date | string | null;
  minTeamSize?: number;
  maxTeamSize?: number;
  location?: string;
  rules?: string;
  submissionRequirements?: string;
  prizes?: string;
  registrationUrl?: string;
  registrationLabel?: string;
  registrationMode?: RegistrationMode;
  registrationFields?: HackathonFormField[];
}

export interface UpdateHackathonRequest extends Partial<CreateHackathonRequest> {}

export interface RegisterHackathonRequest {
  answers: Record<string, unknown>;
}

export interface ReviewHackathonRegistrationRequest {
  reviewStatus: ReviewStatus;
  reviewNote?: string;
}

export interface HackathonRegistrationList {
  items: HackathonRegistration[];
  total: number;
  page: number;
  limit: number;
}

export interface CreateTeamRequest {
  name: string;
  slogan?: string;
}

export interface CreateSubmissionRequest {
  title: string;
  description: string;
  demoUrl?: string;
  repoUrl?: string;
  videoUrl?: string;
  teamId?: string;
  status?: SubmissionStatus;
  attachments?: UploadedFileMeta[];
}

export interface UpdateSubmissionRequest extends Partial<CreateSubmissionRequest> {}

export interface CreateAnnouncementRequest {
  title: string;
  content: string;
  isPinned?: boolean;
}

export interface JudgeSubmissionRequest {
  score: number;
  feedback?: string;
  status?: SubmissionStatus;
}

export interface HackathonListItem extends Hackathon {
  _count?: {
    registrations?: number;
    teams?: number;
  };
  organizer?: { id: string; name: string } | null;
  myRegistration?: HackathonRegistration | null;
}

export interface HackathonWithDetails extends Hackathon {
  _count?: {
    registrations?: number;
    teams?: number;
    submissions?: number;
  };
  organizer?: { id: string; name: string } | null;
  myRegistration?: HackathonRegistration | null;
  judges?: Judge[];
  announcements?: Announcement[];
  teams?: (Team & { members: (TeamMember & { user: { id: string; name: string; avatarUrl?: string | null } })[] })[];
  submissions?: (Submission & { user?: { id: string; name: string } | null; team?: { id: string; name: string } | null })[];
}

// ==================== API Response Wrappers ====================

export interface ApiResponse<T = any> {
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

// ==================== P1-8 证书 ====================

export type CertificateType = 'course' | 'degree' | 'hackathon';

export interface Certificate {
  id: string;
  userId: string;
  type: CertificateType | string;
  refId: string;
  title: string;
  description?: string | null;
  /** 证书编号 (e.g. "OCSG-2026-COURSE-0001") */
  serialNumber: string;
  issuedAt: Date | string;
  completedAt: Date | string;
  imageUrl?: string | null;
  verifyUrl?: string | null;
  /** JSON 字符串 (mock) */
  metadata?: Record<string, unknown> | null;
  revokedAt?: Date | string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  /** P1-8: 后端附带的 holderName (避免前端 join) */
  holderName?: string | null;
  /** P1-8: 后端附带的 valid 字段 (false = 已撤销) */
  valid?: boolean;
}

export interface VerifyCertificateResult {
  valid: boolean;
  reason?: 'not_found' | 'revoked';
  certificate?: {
    id?: string;
    serialNumber: string;
    title?: string;
    type?: string;
    description?: string | null;
    issuedAt?: Date | string;
    completedAt?: Date | string;
    verifyUrl?: string | null;
    imageUrl?: string | null;
    holderName?: string;
    revokedAt?: Date | string;
  };
}
