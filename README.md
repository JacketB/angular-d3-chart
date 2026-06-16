# Angular D3 SCADA Chart Library

Библиотека предоставляет легковесный Angular-компонент на базе D3.js для визуализации многопоточных динамических данных (трендов) в реальном времени. Элементы графика оптимизированы для интеграции в SCADA и веб-интерфейсы систем промышленного мониторинга.

## Основные возможности

* **Динамическое обновление без мерцания:** Обновление путей линий (`path`) и подписей осей «на лету» через механизм Change Detection без полной перерисовки DOM-структуры SVG. Тултип и зум не слетают при обновлении данных.
* **Два режима интерактивного зума:** * `freeze` (Исторический анализ) — фиксация временного окна для детального изучения среза данных (потоковые данные копятся в буфере).
  * `scroll` (Скользящее окно) — удержание выбранного масштаба (длительности окна) со смещением сетки вслед за прилетающими в реальном времени точками.
* **Интерактивный SVG-тултип:** Автоматически обновляемое при статичной мыши перекрестие (Crosshair) и информационное окно, отображающее точные значения всех активных параметров.
* **Фильтрация разрывов связи:** Автоматическое сегментирование линий, если интервал между точками превышает заданный лимит (защита от ложных прямых линий при потере сигнала).

## Требования и зависимости

* Angular >= 17
* D3.js >= 7.0
* Moment.js >= 2.0

## Установка

Установите необходимые peer-зависимости в ваш проект:

```bash
npm install d3 moment
npm install @types/d3 --save-dev

```

## Использование

### 1. Подключение компонента

Импортируйте компонент `AngularD3ChartComponent` в ваш Standalone-компонент или модуль:

```typescript
import { Component, OnInit, signal } from '@angular/core';
import { AngularD3ChartComponent } from 'angular-d3-scada-chart';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [AngularD3ChartComponent],
  templateUrl: './app.component.html'
})
export class AppComponent implements OnInit {
  chartDataSignal = signal<any[]>([]);
  
  linesConfig = [
    { key: 'param1', label: 'Температура', visible: true },
    { key: 'param2', label: 'Давление', visible: true },
    { key: 'param3', label: 'Ток', visible: true },
    { key: 'param4', label: 'Напряжение', visible: true }
  ];

  ngOnInit() {
    // Логика получения данных (WebSocket / Стрим / Троттленный Interval)
    setInterval(() => {
      this.chartDataSignal.set(this.getRealtimeData());
    }, 5000);
  }
}

```

### 2. Шаблон компонента

Передайте конфигурацию, режим зума и сигнал с данными во входные параметры компонента:

```html
<div style="width: 100%; height: 500px; position: relative;">
  <lib-angular-d3-chart 
    [chartData]="chartDataSignal()" 
    [linesConfig]="linesConfig"
    chartName="scadaLiveChart"
    [enableTooltip]="true"
    [chartHeight]="400"
    zoomMode="scroll"> </lib-angular-d3-chart>
</div>

```

## API компонента

### Входные параметры (Inputs)

| Параметр | Тип | По умолчанию | Описание |
| --- | --- | --- | --- |
| `chartData` | `ChartData[]` | `[]` | Массив технологических данных для отображения. |
| `linesConfig` | `LineConfig[]` | `[]` | Конфигурация отображаемых линий (ключи, названия и начальный флаг видимости). |
| `chartHeight` | `number` | `400` | Фиксированная высота графика в пикселях. |
| `chartName` | `string` | `'defaultChart'` | Уникальный идентификатор графика для изоляции DOM-элементов масок и линий. |
| `enableTooltip` | `boolean` | `true` | Флаг включения/выключения интерактивного перекрестия и всплывающего окна. |
| `zoomMode` | `'freeze' | 'scroll'` | `'freeze'` | Режим поведения графика при зуме во время входящего реалтайм-потока данных. |

### Структуры данных

**LineConfig:**

```typescript
export interface LineConfig {
  key: string;       // Ключ поля в объекте данных (например, 'param1')
  label: string;     // Отображаемое имя параметра в тултипе и легенде
}

```

**ChartData:**

```typescript
export interface ChartData {
  id: string | number;   // Уникальный идентификатор точки
  time: string;          // Метка времени в формате ISO string
  [key: string]: any;    // Динамические ключи параметров, описанные в LineConfig (number | string)
}

```

## Стилизация и кастомизация

Стили элементов тултипа, легенды и сетки кастомизируются через переопределение CSS-классов в глобальных стилях вашего приложения с использованием селектора `::ng-deep`:

* `.svg-tooltip-bg` — фон, скругление (`rx`) и рамка всплывающего окна тултипа.
* `.tooltip-text` — параметры шрифта и цвета текста внутри тултипа.
* `.grid` (`.x-axis` / `.y-axis`) — линии координатной сетки D3.
* `.loader` — стили CSS-индикатора загрузки (спиннера).

## Лицензия

MIT
