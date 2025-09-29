import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { EthService } from './eth/eth.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: EthService,
          useValue: {
            getProvider: () => ({ getBlockNumber: async () => 123 }),
          },
        },
      ],
    }).compile();

    appController = module.get<AppController>(AppController);
  });

  it('healthz returns ok true when provider works', async () => {
    const res = await appController.healthz();
    expect(res).toEqual({ ok: true });
  });

  it('healthz returns ok false when provider throws', async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        {
          provide: EthService,
          useValue: {
            getProvider: () => ({ getBlockNumber: async () => { throw new Error('boom'); } }),
          },
        },
      ],
    }).compile();

    const ctrl = module.get<AppController>(AppController);
    const res = await ctrl.healthz();
    expect(res).toEqual({ ok: false });
  });
});
