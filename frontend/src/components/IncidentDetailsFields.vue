<script setup>
import { useIncidentServiceDetails } from "../composables/useIncidentServiceDetails";

const {
  followupOptions,
  getField,
  hint: serviceTypeHint,
  isCustomerOptions,
  isCustomerSelected,
  isFollowupOtherVisible,
  isFollowupSelected,
  isSectionVisible,
  isServiceTypeSelected,
  isServiceTypeOtherVisible,
  productOptions,
  setField,
  setFollowup,
  setIsCustomer,
  setServiceType,
  serviceTypeOptions,
} = useIncidentServiceDetails();
</script>

<template>
  <details class="incident-details">
    <summary>報修表單補充資訊</summary>
    <div class="details-grid">
      <div class="field full" data-service-section="base">
        <label>服務類型</label>
        <div class="choice-group">
          <label v-for="serviceType in serviceTypeOptions" :key="serviceType" class="choice-item">
            <input
              type="radio"
              name="serviceType"
              :value="serviceType"
              data-incident-radio="serviceType"
              :checked="isServiceTypeSelected(serviceType)"
              @change="setServiceType($event.target.value)"
            />
            {{ serviceType }}
          </label>
        </div>
        <input id="incidentServiceTypeOther" type="text" data-incident-field="serviceTypeOther" data-service-section="other" :hidden="!isServiceTypeOtherVisible" :value="getField('serviceTypeOther')" placeholder="服務類型為其他時填寫" @input="setField('serviceTypeOther', $event.target.value)" />
        <div id="serviceTypeHint" class="service-type-hint">{{ serviceTypeHint }}</div>
      </div>

      <div class="field" data-service-section="repair aws" :hidden="!isSectionVisible('repair aws')">
        <label for="incidentProductName">產品名稱</label>
        <select id="incidentProductName" data-incident-field="productName" :value="getField('productName')" @change="setField('productName', $event.target.value)">
          <option value="">選取產品</option>
          <option v-for="product in productOptions" :key="product" :value="product">{{ product }}</option>
        </select>
      </div>

      <div class="field" data-service-section="repair" :hidden="!isSectionVisible('repair')">
        <label for="incidentContractId">合約編號</label>
        <input id="incidentContractId" type="text" data-incident-field="contractId" :value="getField('contractId')" placeholder="無則填無" @input="setField('contractId', $event.target.value)" />
      </div>

      <div class="field" data-service-section="repair aws other" :hidden="!isSectionVisible('repair aws other')">
        <label>是否為客戶</label>
        <div class="choice-group">
          <label v-for="option in isCustomerOptions" :key="option" class="choice-item">
            <input
              type="radio"
              name="isCustomer"
              :value="option"
              data-incident-radio="isCustomer"
              :checked="isCustomerSelected(option)"
              @change="setIsCustomer($event.target.value)"
            />
            {{ option }}
          </label>
        </div>
      </div>

      <div class="field full" data-service-section="base">
        <label>後續處理方式</label>
        <div class="choice-group">
          <label v-for="followup in followupOptions" :key="followup" class="choice-item">
            <input
              type="checkbox"
              :data-incident-followup="followup"
              :checked="isFollowupSelected(followup)"
              @change="setFollowup(followup, $event.target.checked)"
            />
            {{ followup }}
          </label>
        </div>
        <input id="incidentFollowupOther" type="text" data-incident-field="followupOther" :hidden="!isFollowupOtherVisible" :value="getField('followupOther')" placeholder="後續處理方式為其他時填寫" @input="setField('followupOther', $event.target.value)" />
      </div>

      <div class="field full" data-service-section="base">
        <label for="incidentExtraInfo">其他補充</label>
        <textarea id="incidentExtraInfo" data-incident-field="extraInfo" :value="getField('extraInfo')" @input="setField('extraInfo', $event.target.value)"></textarea>
      </div>
    </div>
  </details>
</template>
