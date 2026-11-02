import { CertificatesService } from './certificates.service';
import { BadRequestException } from '@nestjs/common';

describe('CertificatesService', () => {
  it('reissues after a revoked certificate instead of returning the invalid row', async () => {
    const revoked = { id: 'revoked-cert', revokedAt: new Date() };
    const replacement = { id: 'replacement-cert', revokedAt: null };
    const prisma = {
      degreeCourse: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      certificate: {
        findFirst: jest
          .fn()
          .mockResolvedValueOnce(null) // no active certificate
          .mockResolvedValueOnce({ serialNumber: 'OCSG-2026-DEGREE-0001' }),
        create: jest.fn().mockResolvedValue(replacement),
      },
    };
    const service = new CertificatesService(prisma as never);

    await expect(
      service.issueCertificate({
        userId: 'user-1',
        type: 'degree',
        refId: 'degree-1',
        title: 'Degree certificate',
      }),
    ).resolves.toBe(replacement);

    expect(prisma.certificate.findFirst).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({ revokedAt: null }),
      }),
    );
    expect(prisma.certificate.create).toHaveBeenCalled();
    expect(revoked.id).not.toBe(replacement.id);
  });

  it('never issues a formal certificate for a private personal course', async () => {
    const prisma = {
      course: {
        findUnique: jest.fn().mockResolvedValue({
          origin: 'ai_personal',
          visibility: 'private',
        }),
      },
      certificate: {
        findFirst: jest.fn(),
        create: jest.fn(),
      },
    };
    const service = new CertificatesService(prisma as never);

    await expect(
      service.issueCertificate({
        userId: 'owner-1',
        type: 'course',
        refId: 'personal-course-1',
        title: 'Private course certificate',
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.certificate.create).not.toHaveBeenCalled();
  });
});
