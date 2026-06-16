import { Component, OnInit, Input, SimpleChanges, OnChanges, ElementRef, ViewChild, Inject, PLATFORM_ID, HostListener } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ChartData, LineConfig } from './scada-data';
import { ChartGeneratorService } from './chart-generator-service';
import * as d3 from 'd3';

@Component({
  selector: 'lib-angular-d3-chart',
  standalone: true,
  providers: [ChartGeneratorService],
  template: `
    <div #chartContainer [id]="chartId"></div>
    <div [id]="'loader'+chartName" class="loader" style="display: none;"></div>
  `,
  styles: [`
    :host { display: block; width: 100%; height: 500px; position: relative; }
    ::ng-deep .selected-area { pointer-events: none; }
    .loader {
      width: 50px; height: 50px; border-radius: 50%; border: 5px solid #353535;
      border-bottom-color: #00FFFF; box-sizing: border-box; animation: rotation 1s linear infinite;
      position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 3;
    }
    @keyframes rotation {
      0% { transform: translate(-50%, -50%) rotate(0deg); }
      100% { transform: translate(-50%, -50%) rotate(360deg); }
    }
  `]
})
export class AngularD3ChartComponent implements OnInit, OnChanges {
  @ViewChild('chartContainer', { static: true }) chartContainer!: ElementRef;

  @Input() chartData: ChartData[] = [];
  @Input() linesConfig: LineConfig[] = []; 
  @Input() chartWidth = 800;
  @Input() chartHeight = 400;
  @Input() chartName = 'defaultChart';
  @Input() enableTooltip = true;
  @Input() zoomMode: 'freeze' | 'scroll' = 'freeze';

  chartId = 'chart';
  private displayData: ChartData[] = [];
  margin = { top: 10, right: 30, bottom: 40, left: 30 };
  width = 0; 
  isBrowser = false;

  private svgGraph: any;
  private svgContainerRef: any;
  private colorScale: any;

  private lastMouseCoordinates: [number, number] | null = null;

  private zoomStartDate: Date | null = null;
  private zoomEndDate: Date | null = null;
  private zoomDurationMs: number | null = null;

  constructor(
    private chartService: ChartGeneratorService,
    @Inject(PLATFORM_ID) private platformId: Object
  ) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngOnInit(): void {
    this.displayData = [...this.chartData];
    if (!this.isBrowser) return;
    this.calculateWidth();
    this.buildChart();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chartData'] || changes['linesConfig'] || changes['zoomMode']) {
      this.displayData = [...this.chartData];
      
      if (this.isBrowser) {
        this.calculateWidth();
        
        if (changes['linesConfig'] || changes['zoomMode']) {
          this.resetZoomState();
        }

        if (this.zoomStartDate && this.zoomEndDate) {
          if (this.zoomMode === 'scroll' && this.zoomDurationMs && this.chartData.length > 0) {
            const lastPointTime = d3.isoParse(this.chartData[this.chartData.length - 1].time)?.getTime() || Date.now();
            
            this.zoomEndDate = new Date(lastPointTime);
            this.zoomStartDate = new Date(lastPointTime - this.zoomDurationMs);
            
            const filtered = this.chartService.filterDataByDateRange(this.chartData, this.zoomStartDate, this.zoomEndDate);

            if (filtered.length > 1) {
              const actualStart = d3.isoParse(filtered[0].time) || this.zoomStartDate;
              const actualEnd = d3.isoParse(filtered[filtered.length - 1].time) || this.zoomEndDate;
              
              this.zoomStartDate = actualStart;
              this.zoomEndDate = actualEnd;
              this.displayData = filtered;
            } else {
              this.displayData = [...this.chartData];
              this.resetZoomState();
            }
          } else {
            this.displayData = this.chartService.filterDataByDateRange(this.chartData, this.zoomStartDate, this.zoomEndDate);
          }
        } else {
          this.displayData = [...this.chartData];
        }

        if (!this.svgGraph || changes['linesConfig']) {
          this.showLoader();
          this.buildChart();
        } else {
          this.updateChartState();
        }
      }
    }
  }

  @HostListener('window:resize')
  onResize(): void {
    if (!this.isBrowser) return;
    this.showLoader();
    this.calculateWidth();
    this.buildChart();
  }

  private showLoader(): void {
    const loader = document.getElementById('loader' + this.chartName);
    if (loader) loader.style.display = 'block';
  }

  private calculateWidth(): void {
    this.width = (window.innerWidth * 0.8) - this.margin.left - this.margin.right;
  }

  private buildChart(): void {
    const container = d3.select(this.chartContainer.nativeElement);
    container.selectAll('*').remove();

    const keys = this.linesConfig.map(c => c.key);
    this.colorScale = d3.scaleOrdinal<string>().domain(keys).range(d3.schemeCategory10);

    this.svgContainerRef = container.append('svg')
      .attr('width', this.width + this.margin.left + this.margin.right)
      .attr('height', this.chartHeight + this.margin.top + this.margin.bottom);

    this.svgGraph = this.svgContainerRef.append('g')
      .attr('transform', `translate(${this.margin.left}, ${this.margin.top})`)
      .attr('id', this.chartId);

    const daterange: [Date, Date] | undefined = (this.zoomStartDate && this.zoomEndDate) 
      ? [this.zoomStartDate, this.zoomEndDate] 
      : undefined;

    this.chartService.initializeChart(
      this.displayData,
      this.linesConfig,
      this.width,
      this.chartHeight,
      this.chartName,
      this.enableTooltip,
      this.svgGraph,
      daterange
    );

    this.addZoomSelection(this.svgContainerRef, this.svgGraph);
    this.svgContainerRef.on('dblclick', () => this.resetZoom(this.svgGraph));

    this.refreshTooltipEvents();
  }

  private updateChartState(): void {
    if (!this.svgGraph) return;

    const daterange: [Date, Date] | undefined = (this.zoomStartDate && this.zoomEndDate) 
      ? [this.zoomStartDate, this.zoomEndDate] 
      : undefined;

    this.chartService.updateChart(
      this.displayData,
      this.linesConfig,
      this.chartName,
      this.svgGraph,
      this.width - 35,
      this.chartHeight,
      this.enableTooltip,
      daterange
    );

    this.refreshTooltipEvents();

    if (this.enableTooltip && this.lastMouseCoordinates) {
      this.triggerTooltipManualUpdate();
    }
  }

  private triggerTooltipManualUpdate(): void {
    if (!this.lastMouseCoordinates || !this.svgGraph) return;

    const daterange: [Date, Date] | undefined = (this.zoomStartDate && this.zoomEndDate) 
      ? [this.zoomStartDate, this.zoomEndDate] 
      : undefined;

    const extent = this.chartService.getTimeExtent(this.displayData);
    const [x, y] = this.chartService.getScales(extent, this.width - 35, this.chartHeight, daterange);
    
    const focus = this.svgGraph.select('.focus-group');
    const tooltipGroup = this.svgGraph.select('.svg-tooltip-container');
    const tooltipRect = tooltipGroup.select('.tooltip-bg');
    const tooltipText = tooltipGroup.select('.tooltip-text');

    if (!focus.empty() && !tooltipGroup.empty() && this.displayData.length > 0) {
      this.chartService.renderTooltipAtCoordinates(
        this.lastMouseCoordinates,
        x, y,
        this.displayData,
        this.linesConfig,
        focus, tooltipGroup, tooltipRect, tooltipText,
        this.width - 35, this.chartHeight, this.colorScale
      );
    }
  }

  private refreshTooltipEvents(): void {
    if (!this.enableTooltip || !this.svgGraph) return;

    this.svgGraph.selectAll('.overlay')
      .on('mouseover', () => {
        this.svgGraph.select('.focus-group').style('display', null);
      })
      .on('mouseout', () => {
        this.svgGraph.select('.focus-group').style('display', 'none');
        this.svgGraph.select('.svg-tooltip-container').style('opacity', 0);
        this.lastMouseCoordinates = null;
      })
      .on('mousemove', (event: any) => {
        this.lastMouseCoordinates = d3.pointer(event, event.currentTarget);
        this.triggerTooltipManualUpdate();
      });
  }

  private resetZoomState(): void {
    this.zoomStartDate = null;
    this.zoomEndDate = null;
    this.zoomDurationMs = null;
  }

  private resetZoom(graph: any): void {
    this.showLoader();
    this.resetZoomState();
    this.displayData = [...this.chartData];
    this.buildChart();
  }

  addZoomSelection(svgContainer: any, graph: any): void {
    let selectedAreaStartX: number | null = null;
    let selectedAreaEndX: number | null = null;

    const updateSelectedArea = () => {
      graph.selectAll('.selected-area').remove();
      if (selectedAreaStartX !== null && selectedAreaEndX !== null) {
        const x1 = Math.min(selectedAreaStartX, selectedAreaEndX);
        const x2 = Math.max(selectedAreaStartX, selectedAreaEndX);
        graph.append('rect').attr('class', 'selected-area').attr('x', x1).attr('y', 0)
          .attr('width', Math.abs(x2 - x1)).attr('height', this.chartHeight).attr('fill', '#5f5f5f36');
      }
    };

    const handleSelection = () => {
      if (selectedAreaStartX !== null && selectedAreaEndX !== null) {
        if (Math.abs(selectedAreaStartX - selectedAreaEndX) > 5) {
          this.showLoader();

          const daterange: [Date, Date] | undefined = (this.zoomStartDate && this.zoomEndDate) 
            ? [this.zoomStartDate, this.zoomEndDate] 
            : undefined;

          const xScale = this.chartService.getXScale(this.displayData, this.width - 35, daterange);

          this.zoomStartDate = xScale.invert(Math.min(selectedAreaStartX, selectedAreaEndX));
          this.zoomEndDate = xScale.invert(Math.max(selectedAreaStartX, selectedAreaEndX));

          this.zoomDurationMs = this.zoomEndDate!.getTime() - this.zoomStartDate!.getTime();

          this.displayData = this.chartService.filterDataByDateRange(this.chartData, this.zoomStartDate!, this.zoomEndDate!);
          this.updateChartState();
        }
        selectedAreaStartX = null;
        selectedAreaEndX = null;
        graph.selectAll('.selected-area').remove();
      }
    };

    const drag = d3.drag<SVGSVGElement, any>()
      .on('start', (event) => {
        const coords = d3.pointer(event, graph.node());
        selectedAreaStartX = coords[0]; selectedAreaEndX = coords[0]; updateSelectedArea();
      })
      .on('drag', (event) => {
        const coords = d3.pointer(event, graph.node());
        selectedAreaEndX = coords[0]; updateSelectedArea();
      })
      .on('end', handleSelection);

    svgContainer.call(drag);
  }
}