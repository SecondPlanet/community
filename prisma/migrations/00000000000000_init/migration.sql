-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password_hash` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `role` ENUM('admin', 'student', 'instructor') NOT NULL DEFAULT 'student',
    `avatar_url` VARCHAR(191) NULL,
    `password_reset_required` BOOLEAN NOT NULL DEFAULT false,
    `points` INTEGER NOT NULL DEFAULT 0,
    `level` INTEGER NOT NULL DEFAULT 1,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `last_login_at` DATETIME(3) NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `users_email_deleted_at_idx`(`email`, `deleted_at`),
    INDEX `users_role_deleted_at_idx`(`role`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `certificates` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` ENUM('course', 'degree', 'hackathon') NOT NULL,
    `ref_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `serial_number` VARCHAR(191) NOT NULL,
    `issued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NOT NULL,
    `image_url` VARCHAR(191) NULL,
    `verify_url` VARCHAR(191) NULL,
    `metadata` JSON NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `certificates_serial_number_key`(`serial_number`),
    INDEX `certificates_user_id_type_idx`(`user_id`, `type`),
    INDEX `certificates_ref_id_type_idx`(`ref_id`, `type`),
    INDEX `certificates_serial_number_idx`(`serial_number`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refresh_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `token` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `refresh_tokens_token_key`(`token`),
    INDEX `refresh_tokens_expires_at_idx`(`expires_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `token_hash` CHAR(64) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `used_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_token_hash_key`(`token_hash`),
    INDEX `password_reset_tokens_user_id_expires_at_idx`(`user_id`, `expires_at`),
    INDEX `password_reset_tokens_expires_at_used_at_idx`(`expires_at`, `used_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_provider_accounts` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `provider_user_id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NULL,
    `display_name` VARCHAR(191) NULL,
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `linked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_used_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,
    `profile` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_provider_accounts_user_id_idx`(`user_id`),
    INDEX `user_provider_accounts_user_id_deleted_at_idx`(`user_id`, `deleted_at`),
    UNIQUE INDEX `user_provider_accounts_provider_provider_user_id_key`(`provider`, `provider_user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `courses` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `learning_points` TEXT NOT NULL,
    `instructor` VARCHAR(191) NOT NULL,
    `level` ENUM('Beginner', 'Intermediate', 'Advanced', 'Expert') NOT NULL,
    `duration` VARCHAR(191) NOT NULL,
    `thumbnail` VARCHAR(191) NOT NULL,
    `tags` TEXT NOT NULL,
    `cost_type` ENUM('free', 'paid', 'charity') NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL DEFAULT 0,
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `course_type` ENUM('own', 'partner', 'public', 'third_party') NOT NULL DEFAULT 'own',
    `external_url` VARCHAR(191) NULL,
    `source_video_url` VARCHAR(191) NULL,
    `source_platform` VARCHAR(191) NULL,
    `owner_user_id` VARCHAR(191) NULL,
    `origin` ENUM('platform', 'ai_personal') NOT NULL DEFAULT 'platform',
    `visibility` ENUM('public', 'private', 'unlisted') NOT NULL DEFAULT 'public',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `category_id` VARCHAR(191) NULL,

    UNIQUE INDEX `courses_source_video_url_key`(`source_video_url`),
    INDEX `courses_status_created_at_idx`(`status`, `created_at`),
    INDEX `courses_cost_type_idx`(`cost_type`),
    INDEX `courses_course_type_idx`(`course_type`),
    INDEX `courses_level_idx`(`level`),
    INDEX `courses_created_at_idx`(`created_at`),
    INDEX `courses_category_id_idx`(`category_id`),
    INDEX `courses_owner_user_id_origin_created_at_idx`(`owner_user_id`, `origin`, `created_at`),
    INDEX `courses_visibility_status_created_at_idx`(`visibility`, `status`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chapters` (
    `id` VARCHAR(191) NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `order_index` INTEGER NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `chapters_course_id_deleted_at_idx`(`course_id`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lessons` (
    `id` VARCHAR(191) NOT NULL,
    `chapter_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `video_url` VARCHAR(191) NULL,
    `video_duration` INTEGER NULL,
    `order_index` INTEGER NOT NULL,
    `is_preview` BOOLEAN NOT NULL DEFAULT false,
    `estimated_minutes` INTEGER NOT NULL DEFAULT 10,
    `is_hidden` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `lessons_chapter_id_deleted_at_idx`(`chapter_id`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `resources` (
    `id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `url` VARCHAR(191) NOT NULL,
    `type` ENUM('pdf', 'code', 'link', 'video', 'audio') NOT NULL,
    `is_locked` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `deleted_at` DATETIME(3) NULL,

    INDEX `resources_lesson_id_deleted_at_idx`(`lesson_id`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `instructors` (
    `id` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `name_en` VARCHAR(191) NULL,
    `title` VARCHAR(120) NULL,
    `title_en` VARCHAR(120) NULL,
    `headline` VARCHAR(255) NULL,
    `headline_en` VARCHAR(255) NULL,
    `bio` TEXT NULL,
    `bio_en` TEXT NULL,
    `avatar_url` VARCHAR(191) NULL,
    `company` VARCHAR(120) NULL,
    `years_of_experience` INTEGER NULL,
    `linkedin_url` VARCHAR(191) NULL,
    `github_url` VARCHAR(191) NULL,
    `twitter_url` VARCHAR(191) NULL,
    `website_url` VARCHAR(191) NULL,
    `contact_email` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `published_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `instructors_slug_key`(`slug`),
    INDEX `instructors_published_at_order_index_idx`(`published_at`, `order_index`),
    INDEX `instructors_name_idx`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_instructor_links` (
    `id` VARCHAR(191) NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `instructor_id` VARCHAR(191) NOT NULL,
    `role` ENUM('instructor', 'mentor') NOT NULL DEFAULT 'instructor',
    `is_primary` BOOLEAN NOT NULL DEFAULT false,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `course_instructor_links_instructor_id_role_idx`(`instructor_id`, `role`),
    INDEX `course_instructor_links_course_id_is_primary_idx`(`course_id`, `is_primary`),
    UNIQUE INDEX `course_instructor_links_course_id_instructor_id_role_key`(`course_id`, `instructor_id`, `role`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `instructor_expertises` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `label_en` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `instructor_expertises_key_key`(`key`),
    INDEX `instructor_expertises_is_active_order_index_idx`(`is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `instructor_expertise_links` (
    `instructor_id` VARCHAR(191) NOT NULL,
    `expertise_id` VARCHAR(191) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    INDEX `instructor_expertise_links_expertise_id_idx`(`expertise_id`),
    PRIMARY KEY (`instructor_id`, `expertise_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `nano_degrees` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `learning_points` TEXT NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `icon` VARCHAR(191) NOT NULL DEFAULT 'sparkles',
    `cost_type` ENUM('free', 'paid', 'charity') NOT NULL,
    `thumbnail` VARCHAR(191) NULL,
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `degree_courses` (
    `degree_id` VARCHAR(191) NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    INDEX `degree_courses_course_id_idx`(`course_id`),
    PRIMARY KEY (`degree_id`, `course_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enrollments` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `course_id` VARCHAR(191) NULL,
    `degree_id` VARCHAR(191) NULL,
    `enrolled_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `source` ENUM('direct', 'degree', 'hackathon', 'promotion', 'order') NOT NULL DEFAULT 'direct',
    `deleted_at` DATETIME(3) NULL,

    INDEX `enrollments_user_id_deleted_at_idx`(`user_id`, `deleted_at`),
    INDEX `enrollments_course_id_deleted_at_idx`(`course_id`, `deleted_at`),
    UNIQUE INDEX `enrollments_user_id_course_id_key`(`user_id`, `course_id`),
    UNIQUE INDEX `enrollments_user_id_degree_id_key`(`user_id`, `degree_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` ENUM('course', 'degree') NOT NULL,
    `course_id` VARCHAR(191) NULL,
    `degree_id` VARCHAR(191) NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'CNY',
    `status` ENUM('pending', 'paid', 'failed', 'expired', 'refunded') NOT NULL DEFAULT 'pending',
    `payment_method` ENUM('wechat', 'alipay', 'stripe') NULL,
    `transaction_id` VARCHAR(191) NULL,
    `paid_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `orders_user_id_status_created_at_idx`(`user_id`, `status`, `created_at`),
    INDEX `orders_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `orders_status_paid_at_idx`(`status`, `paid_at`),
    INDEX `orders_transaction_id_idx`(`transaction_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hackathons` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `banner_url` VARCHAR(191) NULL,
    `status` ENUM('upcoming', 'active', 'judging', 'finished', 'cancelled') NOT NULL DEFAULT 'upcoming',
    `start_date` DATETIME(3) NOT NULL,
    `end_date` DATETIME(3) NOT NULL,
    `register_deadline` DATETIME(3) NULL,
    `submission_deadline` DATETIME(3) NULL,
    `max_team_size` INTEGER NOT NULL DEFAULT 5,
    `min_team_size` INTEGER NOT NULL DEFAULT 1,
    `location` VARCHAR(191) NULL,
    `rules` TEXT NULL,
    `submission_requirements` TEXT NULL,
    `prizes` TEXT NULL,
    `registration_url` VARCHAR(191) NULL,
    `registration_label` VARCHAR(191) NULL,
    `registration_mode` ENUM('internal', 'external') NOT NULL DEFAULT 'internal',
    `registration_fields` JSON NULL,
    `organizer_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `hackathons_status_start_date_idx`(`status`, `start_date`),
    INDEX `hackathons_organizer_id_idx`(`organizer_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hackathon_registrations` (
    `id` VARCHAR(191) NOT NULL,
    `hackathon_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('registered', 'cancelled', 'checked_in') NOT NULL DEFAULT 'registered',
    `registered_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `checked_in_at` DATETIME(3) NULL,
    `answers` JSON NULL,
    `form_snapshot` JSON NULL,
    `review_status` ENUM('pending', 'approved', 'waitlisted', 'rejected') NOT NULL DEFAULT 'pending',
    `review_note` TEXT NULL,
    `reviewed_at` DATETIME(3) NULL,
    `reviewed_by_id` VARCHAR(191) NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `hackathon_registrations_user_id_status_idx`(`user_id`, `status`),
    INDEX `hackathon_registrations_hackathon_id_status_idx`(`hackathon_id`, `status`),
    INDEX `hackathon_registrations_review_status_idx`(`review_status`),
    UNIQUE INDEX `hackathon_registrations_hackathon_id_user_id_key`(`hackathon_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `teams` (
    `id` VARCHAR(191) NOT NULL,
    `hackathon_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slogan` VARCHAR(191) NULL,
    `captain_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `teams_hackathon_id_idx`(`hackathon_id`),
    INDEX `teams_captain_id_idx`(`captain_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `team_members` (
    `id` VARCHAR(191) NOT NULL,
    `team_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `role` ENUM('captain', 'member') NOT NULL DEFAULT 'member',

    UNIQUE INDEX `team_members_team_id_user_id_key`(`team_id`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `judges` (
    `id` VARCHAR(191) NOT NULL,
    `hackathon_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NULL,
    `avatar_url` VARCHAR(191) NULL,
    `bio` TEXT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `role` VARCHAR(191) NOT NULL DEFAULT 'judge',

    INDEX `judges_hackathon_id_order_index_idx`(`hackathon_id`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sponsors` (
    `id` VARCHAR(191) NOT NULL,
    `hackathon_id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `logo_url` VARCHAR(191) NULL,
    `website_url` VARCHAR(191) NULL,
    `tier` VARCHAR(191) NOT NULL DEFAULT 'silver',
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `sponsors_hackathon_id_tier_order_index_idx`(`hackathon_id`, `tier`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `submissions` (
    `id` VARCHAR(191) NOT NULL,
    `hackathon_id` VARCHAR(191) NOT NULL,
    `team_id` VARCHAR(191) NULL,
    `user_id` VARCHAR(191) NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `demo_url` VARCHAR(191) NULL,
    `repo_url` VARCHAR(191) NULL,
    `video_url` VARCHAR(191) NULL,
    `attachments` JSON NULL,
    `status` ENUM('draft', 'submitted', 'under_review', 'shortlisted', 'winner', 'rejected') NOT NULL DEFAULT 'draft',
    `score` DECIMAL(5, 2) NULL,
    `feedback` TEXT NULL,
    `submitted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `submissions_hackathon_id_status_idx`(`hackathon_id`, `status`),
    INDEX `submissions_user_id_idx`(`user_id`),
    INDEX `submissions_team_id_idx`(`team_id`),
    INDEX `submissions_status_submitted_at_idx`(`status`, `submitted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` VARCHAR(191) NOT NULL,
    `hackathon_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `is_pinned` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `announcements_hackathon_id_is_pinned_created_at_idx`(`hackathon_id`, `is_pinned`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `progress_records` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NOT NULL,
    `status` ENUM('not_started', 'in_progress', 'completed') NOT NULL DEFAULT 'not_started',
    `completed_at` DATETIME(3) NULL,
    `last_position` INTEGER NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `progress_records_course_id_status_idx`(`course_id`, `status`),
    INDEX `progress_records_lesson_id_idx`(`lesson_id`),
    INDEX `progress_records_user_id_status_idx`(`user_id`, `status`),
    INDEX `progress_records_status_completed_at_idx`(`status`, `completed_at`),
    UNIQUE INDEX `progress_records_user_id_lesson_id_key`(`user_id`, `lesson_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_projects` (
    `id` VARCHAR(191) NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `project_url` VARCHAR(191) NOT NULL,
    `thumbnail_url` VARCHAR(191) NULL,
    `difficulty` ENUM('beginner', 'intermediate', 'advanced', 'expert') NOT NULL DEFAULT 'intermediate',
    `estimated_time` INTEGER NOT NULL DEFAULT 30,
    `tags` TEXT NULL,
    `project_type` ENUM('model_deployment', 'model_training', 'model_inference', 'api_integration', 'notebook', 'sandbox', 'repository', 'csghub_space') NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `requirements` TEXT NULL,
    `objectives` TEXT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `practice_projects_course_id_is_active_order_index_idx`(`course_id`, `is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `practice_completions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `status` ENUM('in_progress', 'completed', 'skipped') NOT NULL DEFAULT 'in_progress',
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,
    `submission_url` VARCHAR(191) NULL,
    `notes` TEXT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `practice_completions_user_id_status_idx`(`user_id`, `status`),
    INDEX `practice_completions_project_id_status_idx`(`project_id`, `status`),
    UNIQUE INDEX `practice_completions_user_id_project_id_key`(`user_id`, `project_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `badges` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NOT NULL,
    `icon` VARCHAR(191) NOT NULL DEFAULT 'award',
    `category` VARCHAR(191) NOT NULL DEFAULT 'general',
    `criteria_type` ENUM('course_completed', 'lessons_completed', 'streak_days', 'first_enrollment', 'practice_completed', 'points_reached', 'course_specific') NOT NULL,
    `criteria_value` INTEGER NOT NULL DEFAULT 1,
    `criteria_json` JSON NULL,
    `points` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `badges_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_badges` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `badge_id` VARCHAR(191) NOT NULL,
    `unlocked_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `user_badges_user_id_idx`(`user_id`),
    UNIQUE INDEX `user_badges_user_id_badge_id_key`(`user_id`, `badge_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `point_transactions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `amount` INTEGER NOT NULL,
    `reason` VARCHAR(191) NOT NULL,
    `ref_type` ENUM('lesson', 'practice', 'badge', 'enrollment') NULL,
    `ref_id` VARCHAR(191) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `point_transactions_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `point_transactions_user_id_deleted_at_idx`(`user_id`, `deleted_at`),
    UNIQUE INDEX `point_transactions_user_id_ref_type_ref_id_key`(`user_id`, `ref_type`, `ref_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reviews` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL,
    `content` TEXT NOT NULL,
    `helpful` INTEGER NOT NULL DEFAULT 0,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `reviews_course_id_created_at_idx`(`course_id`, `created_at`),
    INDEX `reviews_course_id_helpful_idx`(`course_id`, `helpful`),
    INDEX `reviews_course_id_deleted_at_idx`(`course_id`, `deleted_at`),
    UNIQUE INDEX `reviews_user_id_course_id_key`(`user_id`, `course_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `review_helpful_votes` (
    `review_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `review_helpful_votes_user_id_created_at_idx`(`user_id`, `created_at`),
    PRIMARY KEY (`review_id`, `user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notes` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NOT NULL,
    `content` TEXT NOT NULL,
    `position_sec` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `notes_user_id_lesson_id_position_sec_idx`(`user_id`, `lesson_id`, `position_sec`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `type` ENUM('announcement', 'comment', 'hackathon', 'order') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `body` TEXT NOT NULL,
    `link_url` VARCHAR(191) NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `read_at` DATETIME(3) NULL,
    `deleted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notifications_user_id_is_read_created_at_idx`(`user_id`, `is_read`, `created_at`),
    INDEX `notifications_user_id_deleted_at_created_at_idx`(`user_id`, `deleted_at`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_projects` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `create_request_key` VARCHAR(191) NOT NULL,
    `seed_type` ENUM('question', 'book', 'document', 'course') NOT NULL DEFAULT 'question',
    `seed_text` TEXT NOT NULL,
    `learning_goal` TEXT NULL,
    `target_level` ENUM('Beginner', 'Intermediate', 'Advanced', 'Expert') NULL,
    `available_minutes` INTEGER NULL,
    `preferences` JSON NULL,
    `plan_snapshot` JSON NULL,
    `status` ENUM('planning', 'plan_ready', 'generating_first_lesson', 'ready', 'learning', 'completed', 'failed', 'archived') NOT NULL DEFAULT 'planning',
    `current_step` VARCHAR(191) NULL,
    `progress_percent` INTEGER NOT NULL DEFAULT 0,
    `active_lesson_id` VARCHAR(191) NULL,
    `active_block_id` VARCHAR(191) NULL,
    `active_block_offset` INTEGER NULL,
    `last_accessed_at` DATETIME(3) NULL,
    `plan_version` INTEGER NOT NULL DEFAULT 0,
    `plan_approved_at` DATETIME(3) NULL,
    `last_error_code` VARCHAR(191) NULL,
    `last_error_message` TEXT NULL,
    `archived_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `learning_projects_course_id_key`(`course_id`),
    INDEX `learning_projects_user_id_status_updated_at_idx`(`user_id`, `status`, `updated_at`),
    INDEX `learning_projects_hub_cursor_idx`(`user_id`, `status`, `last_accessed_at`, `id`),
    UNIQUE INDEX `learning_projects_user_id_create_request_key_key`(`user_id`, `create_request_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson_contents` (
    `id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NOT NULL,
    `status` ENUM('empty', 'queued', 'generating', 'ready', 'failed') NOT NULL DEFAULT 'empty',
    `schema_version` INTEGER NOT NULL DEFAULT 1,
    `version` INTEGER NOT NULL DEFAULT 1,
    `blocks` JSON NULL,
    `summary` TEXT NULL,
    `glossary` JSON NULL,
    `source_mode` VARCHAR(191) NOT NULL DEFAULT 'model_knowledge',
    `generation_note` TEXT NULL,
    `generated_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `lesson_contents_lesson_id_key`(`lesson_id`),
    INDEX `lesson_contents_status_updated_at_idx`(`status`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson_variants` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NOT NULL,
    `lesson_content_version` INTEGER NOT NULL,
    `block_id` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `content` JSON NULL,
    `job_id` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `lesson_variants_job_id_key`(`job_id`),
    INDEX `lesson_variants_project_id_lesson_id_lesson_content_version__idx`(`project_id`, `lesson_id`, `lesson_content_version`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_concepts` (
    `id` VARCHAR(191) NOT NULL,
    `course_id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `course_concepts_course_id_order_index_idx`(`course_id`, `order_index`),
    UNIQUE INDEX `course_concepts_course_id_key_key`(`course_id`, `key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `lesson_concepts` (
    `lesson_id` VARCHAR(191) NOT NULL,
    `concept_id` VARCHAR(191) NOT NULL,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    INDEX `lesson_concepts_concept_id_idx`(`concept_id`),
    PRIMARY KEY (`lesson_id`, `concept_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learner_concept_states` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `concept_id` VARCHAR(191) NOT NULL,
    `stage` ENUM('unseen', 'learning', 'practicing', 'mastered', 'review') NOT NULL DEFAULT 'unseen',
    `score` INTEGER NOT NULL DEFAULT 0,
    `evidence_count` INTEGER NOT NULL DEFAULT 0,
    `last_evidence` JSON NULL,
    `next_review_at` DATETIME(3) NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `learner_concept_states_user_id_stage_updated_at_idx`(`user_id`, `stage`, `updated_at`),
    UNIQUE INDEX `learner_concept_states_user_id_concept_id_key`(`user_id`, `concept_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessments` (
    `id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NOT NULL,
    `kind` ENUM('diagnostic', 'lesson_check', 'remediation') NOT NULL,
    `status` ENUM('generating', 'ready', 'failed') NOT NULL DEFAULT 'generating',
    `lesson_content_version` INTEGER NOT NULL,
    `schema_version` INTEGER NOT NULL DEFAULT 1,
    `questions` JSON NULL,
    `error_code` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `assessments_project_id_status_created_at_idx`(`project_id`, `status`, `created_at`),
    UNIQUE INDEX `assessments_project_id_lesson_id_kind_lesson_content_version_key`(`project_id`, `lesson_id`, `kind`, `lesson_content_version`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `assessment_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `assessment_id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `status` ENUM('pending', 'grading', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    `client_submission_key` VARCHAR(191) NOT NULL,
    `answers` JSON NOT NULL,
    `grading` JSON NULL,
    `score` INTEGER NULL,
    `recommendation` JSON NULL,
    `submitted_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `graded_at` DATETIME(3) NULL,
    `error_code` VARCHAR(191) NULL,

    INDEX `assessment_attempts_user_id_submitted_at_idx`(`user_id`, `submitted_at`),
    INDEX `assessment_attempts_assessment_id_status_submitted_at_idx`(`assessment_id`, `status`, `submitted_at`),
    UNIQUE INDEX `assessment_attempts_assessment_id_user_id_client_submission__key`(`assessment_id`, `user_id`, `client_submission_key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ai_generation_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `project_id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NULL,
    `attempt_id` VARCHAR(191) NULL,
    `parent_job_id` VARCHAR(191) NULL,
    `type` ENUM('course_plan', 'lesson_content', 'lesson_variant', 'assessment_generate', 'assessment_grade') NOT NULL,
    `status` ENUM('queued', 'running', 'succeeded', 'failed', 'cancelled') NOT NULL DEFAULT 'queued',
    `enqueue_status` ENUM('pending', 'enqueued', 'cancelled') NOT NULL DEFAULT 'pending',
    `request_key` VARCHAR(191) NOT NULL,
    `execution_no` INTEGER NOT NULL DEFAULT 1,
    `input_hash` VARCHAR(191) NOT NULL,
    `target_version` INTEGER NULL,
    `progress` INTEGER NOT NULL DEFAULT 0,
    `current_step` VARCHAR(191) NULL,
    `queue_attempts` INTEGER NOT NULL DEFAULT 0,
    `manual_retries` INTEGER NOT NULL DEFAULT 0,
    `next_enqueue_at` DATETIME(3) NULL,
    `enqueue_lease_owner` VARCHAR(191) NULL,
    `enqueue_lease_expires_at` DATETIME(3) NULL,
    `execution_lease_owner` VARCHAR(191) NULL,
    `execution_lease_expires_at` DATETIME(3) NULL,
    `heartbeat_at` DATETIME(3) NULL,
    `cancel_requested_at` DATETIME(3) NULL,
    `provider_request_started_at` DATETIME(3) NULL,
    `provider_request_deadline_at` DATETIME(3) NULL,
    `provider_request_finished_at` DATETIME(3) NULL,
    `error_code` VARCHAR(191) NULL,
    `error_message` TEXT NULL,
    `result_ref` JSON NULL,
    `started_at` DATETIME(3) NULL,
    `finished_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `ai_generation_jobs_project_id_status_created_at_idx`(`project_id`, `status`, `created_at`),
    INDEX `ai_generation_jobs_enqueue_status_next_enqueue_at_idx`(`enqueue_status`, `next_enqueue_at`),
    INDEX `ai_jobs_enqueue_lease_idx`(`enqueue_status`, `enqueue_lease_expires_at`),
    INDEX `ai_jobs_execution_lease_idx`(`status`, `execution_lease_expires_at`),
    INDEX `ai_jobs_provider_deadline_idx`(`status`, `provider_request_deadline_at`),
    INDEX `ai_generation_jobs_status_created_at_idx`(`status`, `created_at`),
    UNIQUE INDEX `ai_generation_jobs_request_key_execution_no_key`(`request_key`, `execution_no`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_sessions` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NULL,
    `course_id` VARCHAR(191) NULL,
    `project_id` VARCHAR(191) NULL,
    `scope` ENUM('general', 'course', 'lesson', 'project') NOT NULL DEFAULT 'general',
    `title` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `chat_sessions_user_id_lesson_id_idx`(`user_id`, `lesson_id`),
    INDEX `chat_sessions_user_id_updated_at_idx`(`user_id`, `updated_at`),
    INDEX `chat_sessions_project_id_updated_at_idx`(`project_id`, `updated_at`),
    INDEX `chat_sessions_course_id_updated_at_idx`(`course_id`, `updated_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_messages` (
    `id` VARCHAR(191) NOT NULL,
    `session_id` VARCHAR(191) NOT NULL,
    `role` ENUM('user', 'assistant', 'system') NOT NULL,
    `content` TEXT NOT NULL,
    `tokens` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_messages_session_id_created_at_idx`(`session_id`, `created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `learning_events` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `lesson_id` VARCHAR(191) NULL,
    `event_type` ENUM('play', 'pause', 'seek', 'complete', 'replay', 'skip', 'note', 'personal_course_created', 'personal_course_plan_ready', 'personal_course_plan_approved', 'personal_lesson_generation_started', 'personal_lesson_generation_completed', 'personal_lesson_opened', 'personal_lesson_completed', 'personal_assessment_started', 'personal_assessment_completed', 'personal_tutor_action_clicked', 'personal_next_step_clicked') NOT NULL,
    `position_sec` INTEGER NULL,
    `duration_ms` INTEGER NULL,
    `metadata` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `learning_events_user_id_created_at_idx`(`user_id`, `created_at`),
    INDEX `learning_events_lesson_id_event_type_idx`(`lesson_id`, `event_type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_ai_provider_configs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `api_key_enc` TEXT NOT NULL,
    `model` VARCHAR(191) NOT NULL,
    `base_url` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `verified_at` DATETIME(3) NULL,
    `last_verify_error` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `user_ai_provider_configs_user_id_is_active_idx`(`user_id`, `is_active`),
    UNIQUE INDEX `user_ai_provider_configs_user_id_provider_key`(`user_id`, `provider`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_settings` (
    `key` VARCHAR(191) NOT NULL,
    `value_json` JSON NOT NULL,
    `scope` ENUM('global', 'page', 'user') NOT NULL DEFAULT 'global',
    `description` TEXT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `enum_translations` (
    `enum_type` VARCHAR(191) NOT NULL,
    `enum_value` VARCHAR(191) NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'zh-CN',
    `label` VARCHAR(191) NOT NULL,
    `color_class` VARCHAR(191) NULL,
    `icon` VARCHAR(191) NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,

    INDEX `enum_translations_enum_type_locale_idx`(`enum_type`, `locale`),
    PRIMARY KEY (`enum_type`, `enum_value`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `date_format_templates` (
    `scope` ENUM('global', 'locale', 'admin_users_list', 'common_date', 'dashboard_lesson_duration') NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'zh-CN',
    `template` VARCHAR(191) NOT NULL,

    PRIMARY KEY (`scope`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_settings` (
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `scope` ENUM('global', 'page', 'user') NOT NULL DEFAULT 'global',
    `description` TEXT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `page_settings` (
    `page` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` JSON NOT NULL,
    `description` TEXT NULL,
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `page_settings_page_idx`(`page`),
    PRIMARY KEY (`page`, `key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `testimonials` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `quote` TEXT NOT NULL,
    `avatar` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    INDEX `testimonials_is_active_order_index_idx`(`is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `quick_prompts` (
    `id` VARCHAR(191) NOT NULL,
    `emoji` VARCHAR(191) NOT NULL DEFAULT '💡',
    `label` VARCHAR(191) NOT NULL,
    `prompt_text` TEXT NOT NULL,
    `scope` ENUM('lesson', 'course', 'degree', 'global') NOT NULL DEFAULT 'lesson',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    INDEX `quick_prompts_is_active_order_index_idx`(`is_active`, `order_index`),
    INDEX `quick_prompts_scope_is_active_order_index_idx`(`scope`, `is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `course_categories` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `course_categories_key_key`(`key`),
    INDEX `course_categories_is_active_order_index_idx`(`is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `popular_searches` (
    `id` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `click_count` INTEGER NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `popular_searches_keyword_key`(`keyword`),
    INDEX `popular_searches_is_active_order_index_idx`(`is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `hot_keywords` (
    `id` VARCHAR(191) NOT NULL,
    `keyword` VARCHAR(191) NOT NULL,
    `scope` ENUM('courses', 'home', 'search', 'all') NOT NULL DEFAULT 'courses',
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `hot_keywords_keyword_key`(`keyword`),
    INDEX `hot_keywords_scope_is_active_order_index_idx`(`scope`, `is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_providers` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `icon` VARCHAR(191) NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT false,
    `order_index` INTEGER NOT NULL DEFAULT 0,
    `config` JSON NULL,

    INDEX `auth_providers_is_active_order_index_idx`(`is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `top_nav_items` (
    `id` VARCHAR(191) NOT NULL,
    `label` VARCHAR(191) NOT NULL,
    `path` VARCHAR(191) NOT NULL,
    `icon` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    INDEX `top_nav_items_is_active_order_index_idx`(`is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `footer_columns` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `links` JSON NOT NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `order_index` INTEGER NOT NULL DEFAULT 0,

    INDEX `footer_columns_is_active_order_index_idx`(`is_active`, `order_index`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `i18n_messages` (
    `key` VARCHAR(255) NOT NULL,
    `locale` VARCHAR(191) NOT NULL DEFAULT 'zh-CN',
    `value` TEXT NOT NULL,
    `category` ENUM('common', 'auth', 'course', 'hackathon', 'degree', 'admin') NOT NULL DEFAULT 'common',

    INDEX `i18n_messages_category_idx`(`category`),
    PRIMARY KEY (`key`, `locale`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `certificates` ADD CONSTRAINT `certificates_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `refresh_tokens` ADD CONSTRAINT `refresh_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_provider_accounts` ADD CONSTRAINT `user_provider_accounts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `course_categories`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `courses` ADD CONSTRAINT `courses_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chapters` ADD CONSTRAINT `chapters_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lessons` ADD CONSTRAINT `lessons_chapter_id_fkey` FOREIGN KEY (`chapter_id`) REFERENCES `chapters`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `resources` ADD CONSTRAINT `resources_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_instructor_links` ADD CONSTRAINT `course_instructor_links_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_instructor_links` ADD CONSTRAINT `course_instructor_links_instructor_id_fkey` FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `instructor_expertise_links` ADD CONSTRAINT `instructor_expertise_links_instructor_id_fkey` FOREIGN KEY (`instructor_id`) REFERENCES `instructors`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `instructor_expertise_links` ADD CONSTRAINT `instructor_expertise_links_expertise_id_fkey` FOREIGN KEY (`expertise_id`) REFERENCES `instructor_expertises`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `degree_courses` ADD CONSTRAINT `degree_courses_degree_id_fkey` FOREIGN KEY (`degree_id`) REFERENCES `nano_degrees`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `degree_courses` ADD CONSTRAINT `degree_courses_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `enrollments` ADD CONSTRAINT `enrollments_degree_id_fkey` FOREIGN KEY (`degree_id`) REFERENCES `nano_degrees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_degree_id_fkey` FOREIGN KEY (`degree_id`) REFERENCES `nano_degrees`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hackathons` ADD CONSTRAINT `hackathons_organizer_id_fkey` FOREIGN KEY (`organizer_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hackathon_registrations` ADD CONSTRAINT `hackathon_registrations_hackathon_id_fkey` FOREIGN KEY (`hackathon_id`) REFERENCES `hackathons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hackathon_registrations` ADD CONSTRAINT `hackathon_registrations_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `hackathon_registrations` ADD CONSTRAINT `hackathon_registrations_reviewed_by_id_fkey` FOREIGN KEY (`reviewed_by_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `teams` ADD CONSTRAINT `teams_hackathon_id_fkey` FOREIGN KEY (`hackathon_id`) REFERENCES `hackathons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `team_members` ADD CONSTRAINT `team_members_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `judges` ADD CONSTRAINT `judges_hackathon_id_fkey` FOREIGN KEY (`hackathon_id`) REFERENCES `hackathons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `sponsors` ADD CONSTRAINT `sponsors_hackathon_id_fkey` FOREIGN KEY (`hackathon_id`) REFERENCES `hackathons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_hackathon_id_fkey` FOREIGN KEY (`hackathon_id`) REFERENCES `hackathons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_team_id_fkey` FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `submissions` ADD CONSTRAINT `submissions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcements` ADD CONSTRAINT `announcements_hackathon_id_fkey` FOREIGN KEY (`hackathon_id`) REFERENCES `hackathons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_records` ADD CONSTRAINT `progress_records_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_records` ADD CONSTRAINT `progress_records_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `progress_records` ADD CONSTRAINT `progress_records_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_projects` ADD CONSTRAINT `practice_projects_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_completions` ADD CONSTRAINT `practice_completions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `practice_completions` ADD CONSTRAINT `practice_completions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `practice_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_badges` ADD CONSTRAINT `user_badges_badge_id_fkey` FOREIGN KEY (`badge_id`) REFERENCES `badges`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `point_transactions` ADD CONSTRAINT `point_transactions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reviews` ADD CONSTRAINT `reviews_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_helpful_votes` ADD CONSTRAINT `review_helpful_votes_review_id_fkey` FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `review_helpful_votes` ADD CONSTRAINT `review_helpful_votes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notes` ADD CONSTRAINT `notes_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notes` ADD CONSTRAINT `notes_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_projects` ADD CONSTRAINT `learning_projects_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_projects` ADD CONSTRAINT `learning_projects_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_projects` ADD CONSTRAINT `learning_projects_active_lesson_id_fkey` FOREIGN KEY (`active_lesson_id`) REFERENCES `lessons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_contents` ADD CONSTRAINT `lesson_contents_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_variants` ADD CONSTRAINT `lesson_variants_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `learning_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_variants` ADD CONSTRAINT `lesson_variants_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_variants` ADD CONSTRAINT `lesson_variants_job_id_fkey` FOREIGN KEY (`job_id`) REFERENCES `ai_generation_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `course_concepts` ADD CONSTRAINT `course_concepts_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_concepts` ADD CONSTRAINT `lesson_concepts_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lesson_concepts` ADD CONSTRAINT `lesson_concepts_concept_id_fkey` FOREIGN KEY (`concept_id`) REFERENCES `course_concepts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learner_concept_states` ADD CONSTRAINT `learner_concept_states_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learner_concept_states` ADD CONSTRAINT `learner_concept_states_concept_id_fkey` FOREIGN KEY (`concept_id`) REFERENCES `course_concepts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessments` ADD CONSTRAINT `assessments_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `learning_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessments` ADD CONSTRAINT `assessments_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_attempts` ADD CONSTRAINT `assessment_attempts_assessment_id_fkey` FOREIGN KEY (`assessment_id`) REFERENCES `assessments`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `assessment_attempts` ADD CONSTRAINT `assessment_attempts_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_jobs` ADD CONSTRAINT `ai_generation_jobs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_jobs` ADD CONSTRAINT `ai_generation_jobs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `learning_projects`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_jobs` ADD CONSTRAINT `ai_generation_jobs_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_jobs` ADD CONSTRAINT `ai_generation_jobs_attempt_id_fkey` FOREIGN KEY (`attempt_id`) REFERENCES `assessment_attempts`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ai_generation_jobs` ADD CONSTRAINT `ai_generation_jobs_parent_job_id_fkey` FOREIGN KEY (`parent_job_id`) REFERENCES `ai_generation_jobs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_sessions` ADD CONSTRAINT `chat_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_sessions` ADD CONSTRAINT `chat_sessions_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_sessions` ADD CONSTRAINT `chat_sessions_course_id_fkey` FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_sessions` ADD CONSTRAINT `chat_sessions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `learning_projects`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_messages` ADD CONSTRAINT `chat_messages_session_id_fkey` FOREIGN KEY (`session_id`) REFERENCES `chat_sessions`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_events` ADD CONSTRAINT `learning_events_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `learning_events` ADD CONSTRAINT `learning_events_lesson_id_fkey` FOREIGN KEY (`lesson_id`) REFERENCES `lessons`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `user_ai_provider_configs` ADD CONSTRAINT `user_ai_provider_configs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

