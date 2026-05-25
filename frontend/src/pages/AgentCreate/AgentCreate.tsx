/**
 * AgentCreate - 智能体创建/编辑页面主入口
 *
 * 职责：
 * - 整合所有 hooks（useAgentForm, useSkills, useCodeModel, useToken, useDynamicChannels）
 * - 整合所有子组件（BasicInfoSection, PromptSection, SkillSection,
 *   ModelTokenSection, AdvancedSection）
 * - 整合所有弹窗（SkillModal, TokenModal, CodeModal）
 * - 渲染页面整体布局（header + 左右两栏 form + footer）
 */
import { useState, useEffect } from 'react';
import { PlusCircle } from 'lucide-react';
import apiClient from '@/api/client';
import type { BackendSkill, CodeChannel, CodeModel } from './types';
import { CODE_CHANNELS } from './constants';
import { PAGE_STYLES } from './styles';
// Hooks
import { useAgentForm } from './hooks/useAgentForm';
import { useSkills } from './hooks/useSkills';
import { useCodeModel } from './hooks/useCodeModel';
import { useToken } from './hooks/useToken';
import { useDynamicChannels } from './hooks/useDynamicChannels';
import { useAgentCreateEvents } from './hooks/useAgentCreateEvents';
// Section components
import { BasicInfoSection } from './BasicInfoSection';
import { PromptSection } from './PromptSection';
import { SkillSection } from './SkillSection';
import { ModelTokenSection } from './ModelTokenSection';
import { AdvancedSection } from './AdvancedSection';
// Modal components
import { SkillModal } from './SkillModal';
import { TokenModal } from './TokenModal';
import { CodeModal } from './CodeModal';

export function AgentCreate() {
  // const user = useAuthStore((s) => s.user); // reserved for future use

  /* ═══════════════════════════════════════════════════════════
   * 动态渠道加载
   * ═══════════════════════════════════════════════════════════ */
  const { dynamicChannels, presetChannel } = useDynamicChannels();

  /* ═══════════════════════════════════════════════════════════
   * Hooks 初始化
   * ═══════════════════════════════════════════════════════════ */

  // 先声明 state 供 hooks 交叉引用
  const [selChannel, setSelChannel] = useState<CodeChannel>(CODE_CHANNELS[0]);
  const [selModel, setSelModel] = useState<CodeModel | null>(CODE_CHANNELS[0].models[0]);
  const [tValue, setTValue] = useState('');
  const [cBaseUrl, setCBaseUrl] = useState('');

  // 渠道加载完成后，自动选中预设渠道
  useEffect(() => {
    const win = window as unknown as Record<string, unknown>;
    const dc = win.__ac_defaultChannel as CodeChannel | undefined;
    const dm = win.__ac_defaultModel as CodeModel | undefined;
    if (dc && dm) {
      setSelChannel(dc);
      setSelModel(dm);
      delete win.__ac_defaultChannel;
      delete win.__ac_defaultModel;
    }
  }, [dynamicChannels]);

  // Form hook
  const form = useAgentForm(
    dynamicChannels, setSelChannel, setSelModel,
    // 这些 setter 会被 useCodeModel 覆盖，这里传空函数占位
    () => {}, () => {}, () => {}, () => {}, () => {},
    setTValue, setCBaseUrl,
  );

  // Skills hook
  const skills = useSkills();

  // CodeModel hook
  const codeModel = useCodeModel(dynamicChannels, tValue, cBaseUrl, setTValue, setCBaseUrl);

  // Token hook
  const token = useToken(dynamicChannels, selChannel);

  // 同步 selectedChannel/selectedModel 到 form 的 fillForm 回调
  useEffect(() => {
    if (selChannel.id !== CODE_CHANNELS[0].id) {
      // 渠道已更新，确保 form 能访问到最新值
    }
  }, [selChannel]);

  /* ═══════════════════════════════════════════════════════════
   * 编辑模式：加载已绑定技能 ID
   * ═══════════════════════════════════════════════════════════ */
  useEffect(() => {
    if (!form.isEdit || !form.editId) return;
    Promise.all([
      apiClient.get('/skills').catch(() => ({ data: { data: [] } })),
      apiClient.get(`/skills/agent/${form.editId}`).catch(() => ({ data: { data: [] } })),
    ]).then(([, boundRes]) => {
      const boundSkills: BackendSkill[] = boundRes.data.data ?? [];
      skills.loadBackendSkills().then(() => {
        // loadBackendSkills 内部会设置 backendSkills
      });
      // 直接设置 backendSkills（如果还没加载）
      if (skills.backendSkills.length === 0) {
        // 通过 loadBackendSkills 加载
      }
      if (boundSkills.length > 0) {
        form.setSkills(boundSkills.map((s: BackendSkill) => s.id));
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.editId]);

  /* ═══════════════════════════════════════════════════════════
   * 事件处理
   * ═══════════════════════════════════════════════════════════ */
  const events = useAgentCreateEvents({
    form, skills, codeModel, token,
    selChannel, selModel, tValue, cBaseUrl, presetChannel,
  });

  /* ═══════════════════════════════════════════════════════════
   * 渲染
   * ═══════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{PAGE_STYLES}</style>

      {/* ══════════════════════ 技能选择弹窗 ══════════════════════ */}
      <SkillModal
        open={skills.skillModalOpen}
        onClose={skills.closeSkillModal}
        onConfirm={events.handleConfirmSkillModal}
        skills={skills.backendSkills}
        loading={skills.skillsLoading}
        tempSkills={skills.tempSkills}
        onToggleSkill={skills.toggleTempSkill}
      />

      {/* ══════════════════════ Token 接入弹窗 ══════════════════════ */}
      <TokenModal
        open={token.tokenModalOpen}
        onClose={token.closeTokenModal}
        onConfirm={events.handleConfirmTokenModal}
        selectedChannel={selChannel}
        hasBackendKey={token.hasBackendKey}
        presetChannel={presetChannel}
        tempTokenValue={token.tempTokenValue}
        onTempTokenValueChange={token.setTokenValue}
        tempCustomUrl={token.tempCustomUrl}
        onTempCustomUrlChange={token.setCustomBaseUrl}
        tempTokenModel={token.tempTokenModel}
        onTempTokenModelChange={() => {/* handled in confirmTokenModal */}}
        showToken={token.showToken}
        onShowTokenToggle={() => token.setTokenValue(token.tempTokenValue)}
      />

      {/* ══════════════════════ CODE 模型弹窗 ══════════════════════ */}
      <CodeModal
        open={codeModel.codeModelOpen}
        onClose={codeModel.closeCodeModal}
        onConfirm={events.handleConfirmCodeModal}
        dynamicChannels={dynamicChannels}
        tempChannel={codeModel.tempChannel}
        tempModel={codeModel.tempModel}
        tempCustomUrl={codeModel.tempCustomUrl}
        tempTokenValue={codeModel.tempTokenValue}
        customMaxTokens={codeModel.customMaxTokens}
        customTemp={codeModel.customTemp}
        customTopP={codeModel.customTopP}
        customFreqPenalty={codeModel.customFreqPenalty}
        customPresPenalty={codeModel.customPresPenalty}
        onSelectChannel={codeModel.selectTempChannel}
        onSelectModel={codeModel.selectPreset}
        onTempCustomUrlChange={() => {}}
        onTempTokenValueChange={() => {}}
        onCustomMaxTokensChange={codeModel.setCustomMaxTokens}
        onCustomTempChange={codeModel.setCustomTemp}
        onCustomTopPChange={codeModel.setCustomTopP}
        onCustomFreqPenaltyChange={codeModel.setCustomFreqPenalty}
        onCustomPresPenaltyChange={codeModel.setCustomPresPenalty}
        onShowTokenToggle={() => {}}
        showToken={false}
        numInputStyle={form.numInputStyle}
        focusStyle={form.focusStyle}
        blurStyle={form.blurStyle}
      />

      {/* ══════════════════════ 主页面 ══════════════════════ */}
      <div className="ac-wrap">
        <div className="ac-card">

          {/* 顶部 header */}
          <div className="ac-header">
            <PlusCircle size={18} color="#2a3b4d" />
            <span style={{ fontWeight: 700, fontSize: 16, color: '#1a202c' }}>
              {form.isDefaultAgent ? '基于预设创建智能体' : form.isEdit ? '编辑智能体' : '智能体创建'}
            </span>
            {form.isDefaultAgent && (
              <span style={{
                fontSize: 11, padding: '2px 7px', borderRadius: 4,
                background: '#fffbe6', color: '#d48806', border: '1px solid #ffe58f',
                marginLeft: 4,
              }}>预设模板</span>
            )}
          </div>

          <div className="ac-scroll">
            <form className="ac-form" onSubmit={events.handleSubmit}>
              <div className="ac-cols">

                {/* ══ 左栏：基本信息 + 角色设定 ══ */}
                <div className="ac-col">
                  <BasicInfoSection
                    name={form.name} setName={form.setName}
                    description={form.description} setDescription={form.setDescription}
                    style={form.style} setStyle={form.setStyle}
                    outputFmt={form.outputFmt} setOutputFmt={form.setOutputFmt}
                    agentType={form.agentType} setAgentType={form.setAgentType}
                    inputStyle={form.inputStyle}
                    focusStyle={form.focusStyle}
                    blurStyle={form.blurStyle}
                    labelStyle={form.labelStyle}
                    fieldStyle={form.fieldStyle}
                  />
                  <PromptSection
                    role={form.role} setRole={form.setRole}
                    boundary={form.boundary} setBoundary={form.setBoundary}
                    inputStyle={form.inputStyle}
                    focusStyle={form.focusStyle}
                    blurStyle={form.blurStyle}
                    labelStyle={form.labelStyle}
                    fieldStyle={form.fieldStyle}
                  />
                </div>

                {/* ══ 右栏：技能 + 模型 + Token + 高级设置 ══ */}
                <div className="ac-col">
                  <SkillSection
                    skills={form.skills}
                    onOpenModal={events.handleOpenSkillModal}
                    onRemoveSkill={events.handleRemoveSkill}
                    skillDisplayName={skills.skillDisplayName}
                  />
                  <ModelTokenSection
                    selectedChannel={selChannel}
                    selectedModel={selModel}
                    tokenValue={tValue}
                    hasBackendKey={token.hasBackendKey}
                    copied={token.copied}
                    onOpenCodeModal={codeModel.openCodeModal}
                    onOpenTokenModal={events.handleOpenTokenModal}
                    onCopyToken={token.handleCopyToken}
                    labelStyle={form.labelStyle}
                    fieldStyle={form.fieldStyle}
                  />
                  <AdvancedSection
                    memoryTurns={form.memoryTurns} setMemoryTurns={form.setMemoryTurns}
                    tempOverride={form.tempOverride} setTempOverride={form.setTempOverride}
                    visibility={form.visibility} setVisibility={form.setVisibility}
                    skillsConfig={form.skillsConfig} setSkillsConfig={form.setSkillsConfig}
                    inputStyle={form.inputStyle}
                    focusStyle={form.focusStyle}
                    blurStyle={form.blurStyle}
                    labelStyle={form.labelStyle}
                    fieldStyle={form.fieldStyle}
                  />
                </div>
              </div>
            </form>
          </div>

          {/* 底部按钮 */}
          <div className="ac-footer">
            <button type="button" className="ac-btn-cancel"
              onClick={() => form.navigate('/agents')} disabled={form.saving}>
              取消
            </button>
            <button type="button" className="ac-btn-create" onClick={(e: React.FormEvent) => events.handleSubmit(e)} disabled={form.saving}>
              {form.saving
                ? (form.isEdit && !form.isDefaultAgent ? '保存中...' : '创建中...')
                : (form.isDefaultAgent ? '基于此模板创建' : form.isEdit ? '保存' : '创建')}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
