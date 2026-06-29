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

function splitContactHeading(text) {
  const [label = "", ...rest] = String(text || "").split(/[:：]/);

  return {
    label: label.trim(),
    value: rest.join("：").trim(),
  };
}

function getSimpleContactCopyTarget(label) {
  const normalizedLabel = String(label || "").trim();
  const fixedLabels = ["To", "Cc", "固定 CC"];
  const fixedLabel = fixedLabels.find((item) => normalizedLabel.startsWith(item));

  if (fixedLabel) return fixedLabel;

  return normalizedLabel.split(/\s+/)[0] || "此段";
}

function splitCompanyContactLabel(label) {
  const normalizedLabel = String(label || "").trim();
  const matched = normalizedLabel.match(/^(.*?)(主聯絡人|主要聯絡人|POC)\s*(.*)$/);

  if (!matched) {
    return {
      company: normalizedLabel,
      firstContactLabel: "",
    };
  }

  return {
    company: matched[1].trim() || normalizedLabel,
    firstContactLabel: [matched[2], matched[3]].filter(Boolean).join(" ").trim(),
  };
}

function splitContactSegment(segment) {
  const normalizedSegment = String(segment || "").trim();
  const heading = splitContactHeading(normalizedSegment);

  if (heading.value) {
    return {
      label: heading.label,
      value: heading.value,
    };
  }

  const firstContactValueIndex = normalizedSegment.search(/(?:09\d{2}|0\d{1,2}-|[A-Z0-9._%+-]+@)/i);

  if (firstContactValueIndex > 0) {
    return {
      label: normalizedSegment.slice(0, firstContactValueIndex).trim(),
      value: normalizedSegment.slice(firstContactValueIndex).trim(),
    };
  }

  return {
    label: "",
    value: normalizedSegment,
  };
}

function getEmailMatches(text) {
  return Array.from(String(text || "").matchAll(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi))
    .map((match) => match[0]);
}

function getPhoneMatches(text) {
  const value = String(text || "");
  const phoneMatches = [
    ...Array.from(value.matchAll(/09\d{2}[-\s]?\d{3}[-\s]?\d{3}/g)).map((match) => match[0]),
    ...Array.from(value.matchAll(/0\d{1,2}-\d{3,4}-?\d{3,4}(?:\s*#\s*[\d/]+)?/g)).map((match) => match[0]),
  ];

  return Array.from(new Set(phoneMatches));
}

function getContactDetailCopyGroups(contactLabel, value) {
  const label = String(contactLabel || "聯絡人").trim();
  const phones = getPhoneMatches(value).map((phone) => ({
    copyLabel: "複製電話",
    label: `${label} 電話`,
    text: phone,
  }));
  const emails = getEmailMatches(value).map((email) => ({
    copyLabel: "複製 Email",
    label: `${label} Email`,
    text: email,
  }));

  return [...phones, ...emails];
}

function getStructuredContactDetails(label, value) {
  const { company, firstContactLabel } = splitCompanyContactLabel(label);
  const segments = String(value || "")
    .split("；")
    .map((segment) => segment.trim())
    .filter(Boolean);

  const details = segments.flatMap((segment, index) => {
    const parsedSegment = splitContactSegment(segment);
    const contactLabel = parsedSegment.label || (index === 0 ? firstContactLabel : "");
    return getContactDetailCopyGroups(contactLabel, parsedSegment.value);
  });

  return {
    company,
    details,
  };
}

function getContactCopyGroups(items) {
  return items
    .map((item) => {
      const text = String(item || "").trim();
      const { label, value } = splitContactHeading(text);

      if (!value || /^(To|Cc|固定 CC)/.test(label)) {
        return {
          copyLabel: `複製${getSimpleContactCopyTarget(label)}`,
          details: [],
          label: label || "聯絡資訊",
          text,
        };
      }

      const structuredContact = getStructuredContactDetails(label, value);

      return {
        copyLabel: "複製全部",
        details: structuredContact.details,
        label: structuredContact.company,
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
            <div v-if="group.details && group.details.length" class="runbook-contact-details">
              <div
                v-for="detail in group.details"
                :key="`${section.title}-${group.label}-${detail.label}-${detail.text}`"
                class="runbook-contact-detail"
              >
                <div class="runbook-contact-detail-text">
                  <strong>{{ detail.label }}</strong>
                  <span>{{ detail.text }}</span>
                </div>
                <RunbookCopyButton
                  :text="detail.text"
                  :label="detail.copyLabel"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </article>
</template>
