<script setup>
import { computed } from "vue";
import {
  getRunbookCopyGroupButtonLabel,
  getRunbookLinkButtonLabel,
  getRunbookListItemClass,
} from "../composables/useRunbooks";
import RunbookCopyButton from "./RunbookCopyButton.vue";
import RunbookLinkedText from "./RunbookLinkedText.vue";

const props = defineProps({
  categoryName: {
    type: String,
    required: true,
  },
  runbook: {
    type: Object,
    required: true,
  },
});

const emit = defineEmits(["apply-draft"]);

const baseSections = [
  { title: "值班規則", items: () => props.runbook.dutyRules || [], copyGroups: () => [] },
  { title: "信件判斷", items: () => props.runbook.replyRules || [], copyGroups: () => [] },
  { title: "不需處理", items: () => props.runbook.ignoreRules || [], copyGroups: () => [] },
  { title: "觸發情境", items: () => props.runbook.triggers || [], copyGroups: () => [] },
  { title: "先確認", items: () => props.runbook.firstChecks || [], copyGroups: () => [] },
  { title: "處理步驟", items: () => props.runbook.steps || [], copyGroups: () => [] },
  { title: "升級條件", items: () => props.runbook.escalateWhen || [], copyGroups: () => [] },
  { title: "聯絡資訊", items: () => [], copyGroups: () => getContactCopyGroups(props.runbook.contacts || []) },
  { title: "信件收件人", items: () => props.runbook.mailRecipients || [], copyGroups: () => [] },
];

const sections = computed(() => [
  ...baseSections.map((section) => ({
    title: section.title,
    items: section.items(),
    copyGroups: section.copyGroups(),
    wide: false,
  })),
  ...(props.runbook.extraSections || []).map((section) => ({
    title: section.title,
    items: section.items || [],
    copyGroups: section.copyGroups || [],
    wide: Boolean(section.wide),
  })),
].filter((section) => section.items.length || section.copyGroups.length));

const metaLabel = computed(() => props.runbook.severityLabel || "嚴重度");
const actionsCount = computed(() => 1 + (props.runbook.links || []).length);

function getContactLabel(text) {
  return String(text || "").split(/[:：]/)[0].trim() || "聯絡資訊";
}

function getContactCopyTarget(label) {
  const normalizedLabel = String(label || "").trim();
  const fixedLabels = ["To", "Cc", "固定 CC"];
  const fixedLabel = fixedLabels.find((item) => normalizedLabel.startsWith(item));

  if (fixedLabel) return fixedLabel;

  const contactPrefix = normalizedLabel.match(/^(.*?)(主聯絡人|主要聯絡人|次聯絡人|POC)/);
  if (contactPrefix && contactPrefix[1].trim()) return contactPrefix[1].trim();

  return normalizedLabel.split(/\s+/)[0] || "此段";
}

function getContactCopyGroups(items) {
  return items
    .map((item) => {
      const text = String(item || "").trim();
      const label = getContactLabel(text);

      return {
        copyLabel: `複製${getContactCopyTarget(label)}`,
        label,
        text,
      };
    })
    .filter((group) => group.text);
}

function shouldShowSectionCopy(section) {
  return /聯絡資訊|信件收件人/.test(section.title)
    && section.items.length > 0
    && section.copyGroups.length === 0;
}
</script>

<template>
  <article class="runbook-card">
    <div class="runbook-card-header">
      <div>
        <h3 class="runbook-card-title">{{ runbook.title }}</h3>
        <p class="runbook-card-summary">{{ runbook.summary }}</p>
      </div>
      <span class="runbook-tag">{{ categoryName }}</span>
    </div>

    <div class="runbook-card-meta">{{ metaLabel }}：{{ runbook.severity || "未分類" }}</div>

    <div v-if="actionsCount" class="runbook-related-links">
      <h4 class="runbook-related-title">快速動作</h4>
      <div class="runbook-actions">
        <button
          type="button"
          class="runbook-link runbook-draft-button"
          @click="emit('apply-draft', runbook)"
        >
          帶入事件草稿
        </button>
        <a
          v-for="link in runbook.links || []"
          :key="link.href"
          class="runbook-link"
          :href="link.href"
          target="_blank"
          rel="noopener noreferrer"
        >
          {{ getRunbookLinkButtonLabel(link) }}
        </a>
      </div>
    </div>

    <div class="runbook-card-body">
      <div
        v-for="section in sections"
        :key="section.title"
        class="runbook-detail"
        :class="{ wide: section.wide }"
      >
        <div class="runbook-detail-heading">
          <h4>{{ section.title }}</h4>
          <RunbookCopyButton
            v-if="shouldShowSectionCopy(section)"
            :text="section.items"
            label="複製"
          />
        </div>

        <ul v-if="section.items.length">
          <li
            v-for="item in section.items"
            :key="item"
            :class="getRunbookListItemClass(item)"
          >
            <RunbookLinkedText :text="item" :runbook="runbook" />
          </li>
        </ul>

        <div
          v-if="section.copyGroups.length"
          class="runbook-copy-groups"
          :class="{ 'runbook-copy-groups-many': section.copyGroups.length > 4 }"
        >
          <div v-for="group in section.copyGroups" :key="`${section.title}-${group.label}`" class="runbook-copy-group">
            <div class="runbook-copy-group-header">
              <strong class="runbook-copy-group-label">{{ group.label }}</strong>
              <RunbookCopyButton
                :text="group.text"
                :label="getRunbookCopyGroupButtonLabel(group)"
              />
            </div>
            <div class="runbook-copy-group-value">
              <RunbookLinkedText :text="group.text" :runbook="runbook" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>
