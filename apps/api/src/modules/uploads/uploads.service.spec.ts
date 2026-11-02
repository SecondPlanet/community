import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { S3StorageService } from './storage/s3-storage.service';
import { UploadsService } from './uploads.service';

const mockPrisma: any = {
  user: { update: jest.fn() },
  hackathon: { findUnique: jest.fn() },
  hackathonRegistration: { findUnique: jest.fn() },
  teamMember: { findMany: jest.fn() },
};
const mockStorage: any = {
  headObject: jest.fn(),
  deleteObject: jest.fn(),
  presignUpload: jest.fn(),
  presignDownload: jest.fn(),
  getPublicUrlBase: jest.fn().mockReturnValue('https://assets.example.test/secondplanet'),
};

describe('UploadsService', () => {
  let service: UploadsService;
  const user = { userId: 'user-1', role: 'student' };
  const key = 'users/avatars/user-1/123-avatar.png';

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.user.update.mockResolvedValue({ id: 'user-1' });
    mockStorage.deleteObject.mockResolvedValue(undefined);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UploadsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3StorageService, useValue: mockStorage },
      ],
    }).compile();
    service = module.get(UploadsService);
  });

  it('uses actual object metadata and accepts an allowed upload', async () => {
    mockStorage.headObject.mockResolvedValue({ key, size: 1024, contentType: 'image/png; charset=binary' });

    const result = await service.complete({ scope: 'user-avatar', key, refId: 'user-1' }, user);

    expect(result.writtenBack).toBe(true);
    expect(mockPrisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { avatarUrl: 'https://assets.example.test/secondplanet/users/avatars/user-1/123-avatar.png' },
    });
    expect(mockStorage.deleteObject).not.toHaveBeenCalled();
  });

  it('rejects and removes an object whose actual size exceeds the scope limit', async () => {
    mockStorage.headObject.mockResolvedValue({ key, size: 2 * 1024 * 1024 + 1, contentType: 'image/png' });

    await expect(service.complete({ scope: 'user-avatar', key }, user)).rejects.toThrow(BadRequestException);
    expect(mockStorage.deleteObject).toHaveBeenCalledWith(key, true);
  });

  it('rejects and removes an object whose actual content type is not allowed', async () => {
    mockStorage.headObject.mockResolvedValue({ key, size: 1024, contentType: 'application/octet-stream' });

    await expect(service.complete({ scope: 'user-avatar', key }, user)).rejects.toThrow('实际文件类型');
    expect(mockStorage.deleteObject).toHaveBeenCalledWith(key, true);
  });

  it('rejects empty uploaded objects', async () => {
    mockStorage.headObject.mockResolvedValue({ key, size: 0, contentType: 'image/png' });

    await expect(service.complete({ scope: 'user-avatar', key }, user)).rejects.toThrow('上传文件为空');
    expect(mockStorage.deleteObject).toHaveBeenCalledWith(key, true);
  });

  it('does not issue public sponsor-logo upload URLs for SVG files', async () => {
    await expect(
      service.sign(
        {
          scope: 'hackathon-sponsor-logo',
          filename: 'logo.svg',
          mimeType: 'image/svg+xml',
          size: 1024,
        },
        { userId: 'admin-1', role: 'admin' },
      ),
    ).rejects.toThrow('不接受 image/svg+xml');
  });

  it('private application-file scope requires hackathonId and scopes key to hackathon+user', async () => {
    await expect(
      service.sign(
        { scope: 'hackathon-application-file', filename: 'cv.pdf', mimeType: 'application/pdf', size: 1024 },
        user,
      ),
    ).rejects.toThrow('必须传 hackathonId');

    mockPrisma.hackathon.findUnique.mockResolvedValue({
      id: 'h-1',
      registrationMode: 'internal',
      status: 'upcoming',
      registerDeadline: null,
    });
    mockStorage.presignUpload.mockResolvedValue({ uploadUrl: 'https://signed/put', key: 'k', expiresIn: 600 });
    const res = await service.sign(
      { scope: 'hackathon-application-file', filename: 'cv.pdf', mimeType: 'application/pdf', size: 1024, refId: 'h-1' },
      user,
    );
    expect(res.key).toBe('k');
    expect(mockStorage.presignUpload.mock.calls[0][0]).toContain('hackathons/applications/files/h-1/user-1/');
    expect(mockStorage.presignUpload.mock.calls[0][3]).toBe(false);
  });

  it('rejects application-file sign for external-registration hackathons', async () => {
    mockPrisma.hackathon.findUnique.mockResolvedValue({
      id: 'h-1',
      registrationMode: 'external',
      status: 'upcoming',
      registerDeadline: null,
    });
    await expect(
      service.sign(
        { scope: 'hackathon-application-file', filename: 'cv.pdf', mimeType: 'application/pdf', size: 1024, refId: 'h-1' },
        user,
      ),
    ).rejects.toThrow('外部报名');
  });

  it('private complete returns metadata without publicUrl and enforces scoped key ownership', async () => {
    const pkey = 'hackathons/applications/files/h-1/user-1/123-abcd.pdf';
    mockPrisma.hackathon.findUnique.mockResolvedValue({
      id: 'h-1', registrationMode: 'internal', status: 'upcoming', registerDeadline: null,
    });
    mockStorage.headObject.mockResolvedValue({ key: pkey, size: 2048, contentType: 'application/pdf' });

    const res = await service.complete(
      { scope: 'hackathon-application-file', key: pkey, refId: 'h-1', filename: 'cv.pdf' },
      user,
    );
    expect(res.publicUrl).toBeUndefined();
    expect(res.key).toBe(pkey);
    expect(res.name).toBe('cv.pdf');
    expect(res.mimeType).toBe('application/pdf');
    expect(res.writtenBack).toBe(false);

    await expect(
      service.complete(
        { scope: 'hackathon-application-file', key: 'hackathons/applications/files/h-1/user-2/123-x.pdf', refId: 'h-1' },
        user,
      ),
    ).rejects.toThrow('不属于当前用户或活动');
  });

  it('registration attachment download: owner and admin allowed, other users rejected', async () => {
    const pkey = 'hackathons/applications/files/h-1/user-1/123-abcd.pdf';
    mockStorage.presignDownload.mockResolvedValue('https://signed/get');
    const registration = {
      id: 'r-1', hackathonId: 'h-1', userId: 'user-1',
      answers: { f1: { key: pkey, name: 'cv.pdf', size: 1, mimeType: 'application/pdf' } },
    };

    await expect(
      service.getRegistrationAttachmentUrl({ userId: 'user-2', role: 'student' }, registration, 'f1'),
    ).rejects.toThrow('无权读取');

    await expect(
      service.getRegistrationAttachmentUrl(user, registration, 'missing'),
    ).rejects.toThrow('不存在');

    const url = await service.getRegistrationAttachmentUrl(user, registration, 'f1');
    expect(url).toBe('https://signed/get');
    expect(mockStorage.presignDownload).toHaveBeenCalledWith(pkey, expect.any(Number));
  });

  it('submission attachment download: team member allowed, key must match hackathon+owner', async () => {
    const pkey = 'hackathons/submissions/attachments/h-1/user-1/123-abcd.zip';
    mockStorage.presignDownload.mockResolvedValue('https://signed/get');
    mockPrisma.teamMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);
    const submission = {
      id: 's-1', hackathonId: 'h-1', userId: 'user-1', teamId: 't-1',
      attachments: [{ key: pkey, name: 'demo.zip', size: 1, mimeType: 'application/zip' }],
    };

    const url = await service.getSubmissionAttachmentUrl({ userId: 'user-2', role: 'student' }, submission, 0);
    expect(url).toBe('https://signed/get');

    const tampered = { ...submission, attachments: [{ key: 'hackathons/submissions/attachments/h-9/user-1/123-x.zip', name: 'x', size: 1, mimeType: 'application/zip' }] };
    await expect(
      service.getSubmissionAttachmentUrl(user, tampered, 0),
    ).rejects.toThrow('不匹配');
  });

  it('uploadedBy 兜底: 上传者退出队伍后, 现队友仍可下载其附件', async () => {
    const pkey = 'hackathons/submissions/attachments/h-1/user-1/123-abcd.zip';
    mockStorage.presignDownload.mockResolvedValue('https://signed/get');
    // user-1 (上传者) 已不在队员列表里, user-2 是当前队长
    mockPrisma.teamMember.findMany.mockResolvedValue([{ userId: 'user-2' }]);
    const submission = {
      id: 's-1', hackathonId: 'h-1', userId: 'user-2', teamId: 't-1',
      attachments: [{
        key: pkey, name: 'demo.zip', size: 1, mimeType: 'application/zip',
        uploadedBy: 'user-1',
      }],
    };

    const url = await service.getSubmissionAttachmentUrl({ userId: 'user-2', role: 'student' }, submission, 0);
    expect(url).toBe('https://signed/get');
    expect(mockStorage.presignDownload).toHaveBeenCalledWith(pkey, expect.any(Number));
  });

  it('verifyPrivateAttachment: 大小/类型必须与对象存储一致并盖 uploadedBy 章', async () => {
    const pkey = 'hackathons/applications/files/h-1/user-1/123-cv.pdf';
    mockStorage.headObject.mockResolvedValue({ key: pkey, size: 2048, contentType: 'application/pdf' });

    const ok = await service.verifyPrivateAttachment('hackathon-application-file', 'h-1', 'user-1', {
      key: pkey, name: 'cv.pdf', size: 2048, mimeType: 'application/pdf',
    });
    expect(ok.uploadedBy).toBe('user-1');

    await expect(
      service.verifyPrivateAttachment('hackathon-application-file', 'h-1', 'user-1', {
        key: pkey, name: 'cv.pdf', size: 999999, mimeType: 'application/pdf',
      }),
    ).rejects.toThrow('大小');

    await expect(
      service.verifyPrivateAttachment('hackathon-application-file', 'h-1', 'user-1', {
        key: pkey, name: 'cv.pdf', size: 2048, mimeType: 'image/png',
      }),
    ).rejects.toThrow('类型');

    mockStorage.headObject.mockResolvedValue(null);
    await expect(
      service.verifyPrivateAttachment('hackathon-application-file', 'h-1', 'user-1', {
        key: pkey, name: 'cv.pdf', size: 2048, mimeType: 'application/pdf',
      }),
    ).rejects.toThrow('不存在');

    await expect(
      service.verifyPrivateAttachment('hackathon-application-file', 'h-1', 'user-2', {
        key: pkey, name: 'cv.pdf', size: 2048, mimeType: 'application/pdf',
      }),
    ).rejects.toThrow('不匹配');
  });
});
