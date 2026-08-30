import { canTransitionCampaign, CampaignStatus } from '@mailflow/shared';

describe('Campaign State Machine Transition Guard', () => {
  describe('Valid Campaign Transitions', () => {
    it('should allow DRAFT -> SCHEDULED transition', () => {
      expect(canTransitionCampaign(CampaignStatus.DRAFT, CampaignStatus.SCHEDULED)).toBe(true);
    });

    it('should allow DRAFT -> QUEUED transition', () => {
      expect(canTransitionCampaign(CampaignStatus.DRAFT, CampaignStatus.QUEUED)).toBe(true);
    });

    it('should allow SCHEDULED -> QUEUED transition', () => {
      expect(canTransitionCampaign(CampaignStatus.SCHEDULED, CampaignStatus.QUEUED)).toBe(true);
    });

    it('should allow QUEUED -> SENDING transition', () => {
      expect(canTransitionCampaign(CampaignStatus.QUEUED, CampaignStatus.SENDING)).toBe(true);
    });

    it('should allow SENDING -> COMPLETED transition', () => {
      expect(canTransitionCampaign(CampaignStatus.SENDING, CampaignStatus.COMPLETED)).toBe(true);
    });

    it('should allow SCHEDULED -> CANCELLED transition', () => {
      expect(canTransitionCampaign(CampaignStatus.SCHEDULED, CampaignStatus.CANCELLED)).toBe(true);
    });

    it('should allow CANCELLED -> DRAFT transition for editing', () => {
      expect(canTransitionCampaign(CampaignStatus.CANCELLED, CampaignStatus.DRAFT)).toBe(true);
    });

    it('should allow FAILED -> DRAFT transition for editing/rescheduling', () => {
      expect(canTransitionCampaign(CampaignStatus.FAILED, CampaignStatus.DRAFT)).toBe(true);
    });
  });

  describe('Invalid Campaign Transitions', () => {
    it('should reject COMPLETED -> DRAFT transition (terminal state protection)', () => {
      expect(canTransitionCampaign(CampaignStatus.COMPLETED, CampaignStatus.DRAFT)).toBe(false);
    });

    it('should reject COMPLETED -> SENDING transition', () => {
      expect(canTransitionCampaign(CampaignStatus.COMPLETED, CampaignStatus.SENDING)).toBe(false);
    });

    it('should reject CANCELLED -> SENDING transition without redrafting', () => {
      expect(canTransitionCampaign(CampaignStatus.CANCELLED, CampaignStatus.SENDING)).toBe(false);
    });

    it('should reject DRAFT -> COMPLETED transition without queued/sending', () => {
      expect(canTransitionCampaign(CampaignStatus.DRAFT, CampaignStatus.COMPLETED)).toBe(false);
    });
  });
});
