import { PointsController } from './points.controller';
import { PointsService } from './points.service';

describe('PointsController', () => {
  it('GET /points/me 透传当前用户 id 并返回积分快照', async () => {
    const snapshot = { points: 250, level: 2, currentLevelPoints: 100, nextLevelPoints: 400 };
    const service = { getUserPoints: jest.fn().mockResolvedValue(snapshot) } as unknown as PointsService;
    const controller = new PointsController(service);

    const result = await controller.getMyPoints({ user: { userId: 'user-9' } });

    expect(service.getUserPoints).toHaveBeenCalledWith('user-9');
    expect(result).toEqual(snapshot);
  });
});