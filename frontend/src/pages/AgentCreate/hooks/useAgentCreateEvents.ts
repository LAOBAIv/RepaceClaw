/**
 * useAgentCreateEvents - AgentCreate 页面事件处理 Hook
 *
 * 职责：
 * - 整合技能、Token、Code 弹窗的事件处理
 * - 整合表单提交逻辑
 */
import type { CodeChannel, CodeModel } from '../types';
import type { UseSkillsReturn } from './useSkills';
import type { UseCodeModelReturn } from './useCodeModel';
import type { UseTokenReturn } from './useToken';
import type { UseAgentFormReturn } from './useAgentForm';

interface UseAgentCreateEventsParams {
  form: UseAgentFormReturn;
  skills: UseSkillsReturn;
  codeModel: UseCodeModelReturn;
  token: UseTokenReturn;
  selChannel: CodeChannel;
  selModel: CodeModel | null;
  tValue: string;
  cBaseUrl: string;
  presetChannel: TokenChannel | null;
}

export interface UseAgentCreateEventsReturn {
  handleOpenSkillModal: () => void;
  handleConfirmSkillModal: () => void;
  handleRemoveSkill: (id: string) => void;
  handleOpenTokenModal: () => void;
  handleConfirmTokenModal: () => void;
  handleConfirmCodeModal: () => void;
  handleSubmit: (e: React.FormEvent) => void;
}

export function useAgentCreateEvents({
  form, skills, codeModel, token,
  selChannel, selModel, tValue, cBaseUrl, presetChannel,
}: UseAgentCreateEventsParams): UseAgentCreateEventsReturn {

  // 技能弹窗
  const handleOpenSkillModal = () => {
    skills.openSkillModal(form.skills);
  };

  const handleConfirmSkillModal = () => {
    const confirmed = skills.confirmSkillModal();
    form.setSkills(confirmed);
  };

  const handleRemoveSkill = (id: string) => {
    form.setSkills(skills.removeSkill(form.skills, id));
  };

  // Token 弹窗
  const handleOpenTokenModal = () => {
    token.openTokenModal(selChannel, selModel);
  };

  const handleConfirmTokenModal = () => {
    token.confirmTokenModal(
      selChannel, token.hasBackendKey, presetChannel,
      codeModel.customMaxTokens, codeModel.customTemp, codeModel.customTopP,
      codeModel.customFreqPenalty, codeModel.customPresPenalty,
      (m: CodeModel) => {void m;},
    );
  };

  // Code 弹窗
  const handleConfirmCodeModal = () => {
    codeModel.confirmCodeModal();
  };

  // 提交
  const handleSubmit = (e: React.FormEvent) => {
    form.handleSubmit(
      e, skills.backendSkills,
      selChannel, selModel,
      codeModel.customMaxTokens, codeModel.customTemp, codeModel.customTopP,
      codeModel.customFreqPenalty, codeModel.customPresPenalty,
      tValue, cBaseUrl,
    );
  };

  return {
    handleOpenSkillModal,
    handleConfirmSkillModal,
    handleRemoveSkill,
    handleOpenTokenModal,
    handleConfirmTokenModal,
    handleConfirmCodeModal,
    handleSubmit,
  };
}
