<script setup>
import { useLinksPanel } from "../composables/useLinksPanel";

const coreLinks = [
  {
    label: "Jira",
    href: "https://metaage-corp-p400.atlassian.net/jira/core/projects/PMP/board?filter=&groupBy=status",
  },
  {
    label: "Outlook 郵件",
    href: "https://outlook.cloud.microsoft/mail/",
  },
  {
    label: "Teams",
    href: "https://teams.cloud.microsoft/",
  },
  {
    label: "官方 LINE",
    href: "https://chat.line.biz/U8c283f2c2fa0a4a60807e86a9474e802/",
  },
  {
    label: "設備檢查表",
    href: "https://forms.office.com/Pages/ResponsePage.aspx?id=fJowoSKEfk2DKqRqO2dIXDL92xpZgdhAoa8oJTt9h7dURDZNTkpMQkRCT0RBSVpRMzk4REhIOUFUMy4u",
  },
  {
    label: "輪班表",
    href: "https://dtimis.sharepoint.com/:x:/s/P400-P400/EbAHuKozowhItY7fzhOxlGgB-wwGX7D12r36wpLXbQUD4g?e=q3ZKNA",
  },
  {
    label: "MinIO Issues",
    href: "https://subnet.min.io/issues",
  },
];

const checklistItems = [
  { id: "open-core", label: "開啟每日值班入口" },
  { id: "phone-test", label: "完成話機通話測試" },
  { id: "rota", label: "確認輪班表與值班手機" },
  { id: "equipment", label: "更新設備檢查表" },
  { id: "alerts", label: "確認 Jira / MinIO / 重要告警" },
  { id: "handover", label: "交班前整理未結案事件" },
];

const {
  checked,
  checklistMeta,
  drawerRef,
  isChecklistComplete,
  isOpen,
  openCoreLinks,
  panelRef,
  phoneStatus,
  resetChecklist,
  setChecklistItem,
  startPhoneTestCall,
  status,
  togglePanel,
} = useLinksPanel(checklistItems, coreLinks);
</script>

<template>
  <section id="linksPanel" ref="panelRef" class="links-panel" :class="{ open: isOpen }" aria-label="值班入口">
    <button
      id="linksPanelToggle"
      class="links-panel-tab"
      type="button"
      @click="togglePanel()"
      aria-controls="linksPanel"
      :aria-expanded="String(isOpen)"
    >
      值班入口
    </button>
    <div class="links-panel-inner">
      <div class="links-panel-header">
        <div>
          <h2 class="links-title">值班入口</h2>
          <div class="links-note">供值班時快速開系統；正式交接內容請用交班摘要。</div>
        </div>
        <div class="links-header-actions">
          <button class="bulk-open" type="button" @click="openCoreLinks">一鍵開啟每日值班</button>
          <button class="phone-test" type="button" @click="startPhoneTestCall">話機通話測試</button>
        </div>
      </div>
      <div id="phoneCallStatus" class="phone-call-status" role="status" aria-live="polite">
        <span v-if="phoneStatus.message">{{ phoneStatus.message }}</span>
        <a v-if="phoneStatus.dialUrl" :href="phoneStatus.dialUrl">再次撥號</a>
      </div>

      <div class="core-links-block">
        <div class="link-section-header compact">
          <h3 class="links-title">每日值班</h3>
          <span id="coreLinksCount" class="link-count">{{ coreLinks.length }} links</span>
        </div>
        <div id="coreLinksGrid" class="links-grid core-links-grid">
          <a
            v-for="link in coreLinks"
            :key="link.href"
            class="quick-link"
            :href="link.href"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ link.label }}
          </a>
        </div>
      </div>

      <details ref="drawerRef" class="link-drawer">
        <summary>
          <span>更多入口</span>
          <span class="drawer-hint">AWS / 公司系統 / 其他</span>
        </summary>

        <div class="link-drawer-body">
          <div class="link-drawer-section">
            <h3 class="links-title">AWS</h3>
            <div id="awsLinksGrid" class="links-grid drawer-links-grid">
              <a class="quick-link" href="https://us-east-1.console.aws.amazon.com/console/home?region=us-east-1#" target="_blank" rel="noopener noreferrer">AWS Console</a>
              <a class="quick-link" href="https://metaage.awsapps.com/start#/" target="_blank" rel="noopener noreferrer">公司 SSO</a>
              <a class="quick-link" href="https://health.aws.amazon.com/health/status" target="_blank" rel="noopener noreferrer">AWS Health</a>
              <a class="quick-link" href="https://calculator.aws/#/addService" target="_blank" rel="noopener noreferrer">AWS 計算機</a>
              <a class="quick-link" href="https://explore.skillbuilder.aws/learn" target="_blank" rel="noopener noreferrer">AWS Skill Builder</a>
            </div>
          </div>

          <div class="link-drawer-section">
            <h3 class="links-title">公司連接</h3>
            <div id="companyLinksGrid" class="links-grid drawer-links-grid">
              <a class="quick-link" href="https://kb.aws-metaage.com/" target="_blank" rel="noopener noreferrer">KB</a>
              <a class="quick-link" href="https://bpm.metaage.com.tw/Gaia/portal" target="_blank" rel="noopener noreferrer">BPM</a>
              <a class="quick-link" href="https://www.cloudman.app/" target="_blank" rel="noopener noreferrer">CloudMan</a>
              <a class="quick-link" href="https://dtimis-my.sharepoint.com/" target="_blank" rel="noopener noreferrer">OneDrive</a>
              <a class="quick-link" href="https://support.aws-sysage.com/pages/UI.php" target="_blank" rel="noopener noreferrer">ITOP</a>
            </div>
          </div>

          <div class="link-drawer-section">
            <h3 class="links-title">其他</h3>
            <div id="otherLinksGrid" class="links-grid drawer-links-grid">
              <a class="quick-link" href="https://jp.dubber.net/%E5%B8%B3%E6%88%B6/d63e63ada4f3448093cbe9792c66f12a/%E9%8C%84%E9%9F%B3" target="_blank" rel="noopener noreferrer">電話錄音下載</a>
            </div>
          </div>
        </div>
      </details>

      <div class="oncall-checklist" :class="{ complete: isChecklistComplete }" aria-label="每日值班檢查">
        <div class="oncall-checklist-header">
          <div>
            <strong>每日值班檢查</strong>
            <span id="oncallChecklistMeta" class="oncall-checklist-meta">{{ checklistMeta }}</span>
          </div>
          <button class="oncall-checklist-reset" type="button" @click="resetChecklist">重置今日</button>
        </div>
        <div id="oncallChecklistItems" class="oncall-checklist-items">
          <label v-for="item in checklistItems" :key="item.id" class="oncall-check-item">
            <input
              type="checkbox"
              :data-oncall-check="item.id"
              :checked="checked[item.id]"
              @change="setChecklistItem(item.id, $event.target.checked)"
            />
            {{ item.label }}
          </label>
        </div>
        <div
          id="oncallChecklistStatus"
          class="oncall-checklist-status"
          :class="status.type"
          role="status"
          aria-live="polite"
        >
          {{ status.message }}
        </div>
      </div>
    </div>
  </section>
</template>
