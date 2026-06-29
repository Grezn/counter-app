<script setup>
import { useLocalWeather } from "../composables/useLocalWeather";

const {
  loadLocalWeather,
  selectedWeatherCounty,
  selectedWeatherDistrict,
  setWeatherCounty,
  setWeatherDistrict,
  weather,
  weatherCountyOptions,
  weatherDistrictOptions,
} = useLocalWeather();
</script>

<template>
  <section class="weather-strip" aria-label="本地即時氣象">
    <div class="weather-header">
      <div>
        <h2 class="weather-title">本地即時氣象</h2>
        <div id="weatherMeta" class="weather-meta">{{ weather.meta }}</div>
      </div>
      <div class="weather-actions">
        <label class="weather-location-picker">
          <span>縣市</span>
          <select
            class="weather-location-select county-select"
            :value="selectedWeatherCounty"
            aria-label="選擇氣象縣市"
            @change="setWeatherCounty($event.target.value)"
          >
            <option value="">自動定位 / 預設</option>
            <option
              v-for="county in weatherCountyOptions"
              :key="county"
              :value="county"
            >
              {{ county }}
            </option>
          </select>
        </label>
        <label class="weather-location-picker">
          <span>地區</span>
          <select
            class="weather-location-select district-select"
            :value="selectedWeatherDistrict"
            aria-label="選擇氣象地區"
            :disabled="!selectedWeatherCounty"
            @change="setWeatherDistrict($event.target.value)"
          >
            <option value="">{{ selectedWeatherCounty ? "縣市預設" : "先選縣市" }}</option>
            <option
              v-for="district in weatherDistrictOptions"
              :key="district"
              :value="district"
            >
              {{ district }}
            </option>
          </select>
        </label>
        <button class="weather-refresh" type="button" @click="loadLocalWeather(true)">更新</button>
      </div>
    </div>

    <div id="weatherContent" class="weather-content" aria-live="polite">
      <template v-if="weather.ready">
        <div class="weather-summary">
          <strong class="weather-temp">{{ weather.temperature }}</strong>
          <div class="weather-summary-text">
            <span class="weather-now">{{ weather.weatherLabel }}</span>
            <span class="weather-forecast-note">{{ weather.forecastNote }}</span>
          </div>
          <span class="weather-sticker" role="img" :aria-label="weather.sticker.label">
            {{ weather.sticker.icon }}
          </span>
        </div>
        <div v-for="chip in weather.chips" :key="chip.label" class="weather-chip">
          <span class="weather-chip-label">{{ chip.label }}</span>
          <strong class="weather-chip-value">{{ chip.value }}</strong>
        </div>
      </template>
      <div v-else class="weather-placeholder">{{ weather.placeholder }}</div>
    </div>
  </section>
</template>
