import { Injectable } from '@angular/core';
import { ChartData, LineConfig } from './scada-data';
import * as d3 from 'd3';
import moment from 'moment';

@Injectable()
export class ChartGeneratorService {
  
  initializeChart(data: ChartData[], configs: LineConfig[], width: number, height: number, chartName: string, isTooltip: boolean = false, svg?: any, daterange?: any) {
    if (!svg) svg = d3.select(`#chart`);
    svg.selectAll("*").remove();

    if (data.length === 0) {
      this.renderNoData(svg, width, height);
      this.toggleLoader(chartName, false);
      return;
    }

    const extent: any = this.getTimeExtent(data);
    const [x, y] = this.getScales(extent, width - 35, height, daterange, data, configs);
    
    this.appendGrid(svg, x, y, width - 35, height);
    this.appendClipPath(svg, width - 35, height);
    
    const chartBody = this.appendChartBody(svg);
    
    const keys = configs.map(c => c.key);
    const colorScale = d3.scaleOrdinal<string>().domain(keys).range(d3.schemeCategory10);
    
    this.renderLines(chartBody, data, configs, x, y, chartName, colorScale);
    this.toggleLoader(chartName, false);

    if (isTooltip) {
      this.createFocusAndTooltip(svg, width - 35, height, configs, colorScale);
    }
  }

  isChartGenerated(svgId: string): boolean {
    return document.getElementById(svgId) !== null;
  }

  updateChart(data: ChartData[], configs: LineConfig[], chartName: string, svg: any, width: number, height: number, isTooltip: boolean, daterange?: [Date, Date], animate = false) {
    if (data.length === 0) {
      this.renderNoData(svg, width, height);
      this.toggleLoader(chartName, false);
      return;
    }

    const clipRect = svg.select('#clip rect');
    if (!clipRect.empty()) {
      clipRect.attr('width', width).attr('height', height);
    }

    const extent: any = this.getTimeExtent(data);
    const [x, y] = this.getScales(extent, width, height, daterange, data, configs);

    const xAxisGrid = d3.axisBottom(x).tickSize(-height).ticks(width < 1000 ? 8 : 5)
      .tickFormat((d: any) => d3.timeFormat(width < 1000 ? "%H:%M:%S" : "%d.%m.%y %H:%M:%S")(d));
    
    const yAxisGrid = d3.axisLeft(y).tickSize(-width).tickFormat(null);

    if (!svg.select('.x-axis').empty() && !svg.select('.y-axis').empty()) {
      svg.select('.x-axis').call(xAxisGrid);
      
      if (animate) {
        svg.select('.y-axis').transition().duration(350).call(yAxisGrid);
      } else {
        svg.select('.y-axis').call(yAxisGrid);
      }
      
      svg.selectAll('.grid text').attr('font-size', '14px').attr('fill', 'var(--scada-axis-text)');
      svg.selectAll('.grid line').attr('stroke', 'var(--scada-grid-lines)');
      svg.selectAll('.grid .domain').attr('stroke', 'var(--scada-grid-lines)');
    } else {
      this.appendGrid(svg, x, y, width, height);
    }
    
    const overlay = svg.select('.overlay');
    if (!overlay.empty()) {
      overlay.attr('width', width).attr('height', height);
    }

    const keys = configs.map(c => c.key);
    const colorScale = d3.scaleOrdinal<string>().domain(keys).range(d3.schemeCategory10);
    const targetContainer = svg.select('[clipPath="url(#clip)"]').empty() ? svg : svg.select('[clipPath="url(#clip)"]');
    
    this.renderLines(targetContainer, data, configs, x, y, chartName, colorScale, animate);

    setTimeout(() => {
      this.toggleLoader(chartName, false);
    }, 0);
  }

  renderLines(targetContainer: any, data: ChartData[], configs: LineConfig[], x: any, y: any, chartName: string, colorScale: any, animate = false) {
    const maxGap = 5 * 60 * 1000;

    configs.forEach((c) => { 
      targetContainer.selectAll(`.${c.key}`).remove(); 
    });

    const visibleConfigs = configs.filter(c => c.visible !== false);
    const segments: { [key: string]: ChartData[][] } = {};
    
    visibleConfigs.forEach((c) => {
      segments[c.key] = [];
      let currentSegment: ChartData[] = [];

      data.forEach((d, i) => {
        const currentTime = d3.isoParse(d.time);
        const previousTime = i > 0 ? d3.isoParse(data[i - 1].time) : null;

        if (currentTime && (!previousTime || currentTime.getTime() - previousTime.getTime() <= maxGap)) {
          currentSegment.push(d);
        } else {
          if (currentSegment.length > 0) segments[c.key].push(currentSegment);
          currentSegment = [d];
        }
      });
      if (currentSegment.length > 0) segments[c.key].push(currentSegment);
    });

    visibleConfigs.forEach((c) => {
      segments[c.key].forEach((segment, index) => {
        const path = targetContainer
          .append('path')
          .datum(segment)
          .attr('class', c.key)
          .attr('id', `${chartName}_${c.key}_${index}`)
          .attr('fill', 'none')
          .attr('stroke', colorScale(c.key))
          .attr('stroke-width', '2px');

        if (animate) {
          path.style('opacity', 0)
            .transition()
            .duration(350)
            .style('opacity', 1)
            .attr('d', d3.line<ChartData>()
              .x(d => { const date = d3.isoParse(d.time); return x(date ? date : new Date(0)); })
              .y(d => { const val = +d[c.key]; return y(isNaN(val) ? 0 : val); })
            );
        } else {
          path.style('opacity', 1)
            .attr('d', d3.line<ChartData>()
              .x(d => { const date = d3.isoParse(d.time); return x(date ? date : new Date(0)); })
              .y(d => { const val = +d[c.key]; return y(isNaN(val) ? 0 : val); })
            );
        }
      });
    });
  }

  private renderNoData(svg: any, width: number, height: number) {
    svg.append("text")
      .attr("x", width / 2)
      .attr("y", height / 2)
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "middle")
      .style("font-size", "72px")
      .style("fill", "#353535")
      .text("NO DATA");
  }

  private toggleLoader(chartName: string, show: boolean) {
    const loader = document.getElementById('loader' + chartName);
    if (loader) loader.style.display = show ? 'block' : 'none';
  }

  getTimeExtent(data: ChartData[]): [Date, Date] {
    const extent = d3.extent(data, (d) => d.time ? d3.isoParse(d.time) : null) as [Date, Date];
    return extent[0] === undefined || extent[1] === undefined ? [new Date(0), new Date(0)] : extent;
  }

  getScales(extent: [Date, Date], width: number, height: number, daterange?: any, data?: ChartData[], configs?: LineConfig[]) {
    const x = d3.scaleTime().domain(daterange || extent).range([0, width]);
    
    let yMin = 0;
    let yMax = 100;

    if (data && data.length > 0 && configs && configs.length > 0) {
      const activeKeys = configs.filter(c => c.visible !== false).map(c => c.key);
      
      if (activeKeys.length > 0) {
        let globalMin = Infinity;
        let globalMax = -Infinity;

        data.forEach(d => {
          activeKeys.forEach(key => {
            const val = +d[key];
            if (!isNaN(val)) {
              if (val < globalMin) globalMin = val;
              if (val > globalMax) globalMax = val;
            }
          });
        });

        if (globalMin !== Infinity && globalMax !== -Infinity) {
          const delta = globalMax - globalMin;
          const padding = delta === 0 ? 10 : delta * 0.1;

          yMin = Math.max(0, globalMin - padding);
          yMax = globalMax + padding;
        }
      }
    } else {
      yMin = 0;
      yMax = 800;
    }

    const y = d3.scaleLinear().domain([yMin, yMax]).range([height, 0]);
    return [x, y];
  }

  appendGrid(svg: any, x: any, y: any, width: number, height: number) {
    const xAxisGrid = d3.axisBottom(x).tickSize(-height).ticks(width < 1000 ? 8 : 5)
      .tickFormat((d: any) => d3.timeFormat(width < 1000 ? "%H:%M:%S" : "%d.%m.%y %H:%M:%S")(d));

    const yTicks = y.ticks().filter((t: any) => t !== 0);
    const yAxisGrid = d3.axisLeft(y).tickSize(-width).tickFormat(null).tickValues(yTicks);

    svg.append('g')
      .attr('class', 'grid x-axis')
      .attr('transform', `translate(0, ${height})`)
      .call(xAxisGrid)

    svg.append('g')
      .attr('class', 'grid y-axis')
      .call(yAxisGrid)

    svg.selectAll('.grid text').attr('font-size', '14px').attr('fill', 'var(--scada-axis-text)');
    svg.selectAll('.grid line').attr('stroke', 'var(--scada-grid-lines)');
    svg.selectAll('.grid .domain').attr('stroke', 'var(--scada-grid-lines)');
  }

  appendClipPath(svg: any, width: number, height: number) {
    if (!svg) return;
    svg.append('defs')
      .append('clipPath')
      .attr('id', 'clip')
      .append('rect').attr('width', width).attr('height', height).attr('x', 0).attr('y', 0);
  }

  appendChartBody(svg: any) {
    return svg.append('g').attr('clipPath', 'url(#clip)');
  }

  createFocusAndTooltip(svg: any, width: number, height: number, configs: LineConfig[], colorScale: any) {
    const focus = svg.append('g').attr('class', 'focus-group').style('display', 'none');

    focus.append('line').attr('id', 'focusLineX').attr('class', 'focusLine').style('stroke', 'var(--scada-crosshair)').style('stroke-width', '1px').style('stroke-dasharray', '3,3');
    focus.append('line').attr('id', 'focusLineY').attr('class', 'focusLine').style('stroke', 'var(--scada-crosshair)').style('stroke-width', '1px').style('stroke-dasharray', '3,3');

    const defs = svg.select('defs').empty() ? svg.append('defs') : svg.select('defs');
    const filter = defs.append('filter').attr('id', 'tooltip-shadow').attr('height', '130%');
    filter.append('feDropShadow')
      .attr('dx', '2')
      .attr('dy', '4')
      .attr('stdDeviation', '4')
      .attr('flood-opacity', '0.15')
      .attr('flood-color', '#000000');

    const tooltipGroup = svg.append('g').attr('class', 'svg-tooltip-container').style('opacity', 0);
    
    tooltipGroup.append('rect')
      .attr('class', 'tooltip-bg')
      .style('fill', 'var(--scada-tooltip-bg)')
      .style('stroke', 'var(--scada-tooltip-border)')
      .style('stroke-width', 1)
      .style('pointer-events', 'none')
      .style('rx', '8')
      .style('filter', 'url(#tooltip-shadow)');

    tooltipGroup.append('g').attr('class', 'tooltip-content-group');

    configs.forEach((c) => {
      focus.append('circle')
        .attr('id', `focusCircle_${c.key}`)
        .attr('r', 5)
        .attr('class', 'focusCircle')
        .style('fill', colorScale(c.key))
        .style('stroke', '#fff')
        .style('stroke-width', '1.5px');
    });

    svg.append('rect')
      .attr('class', 'overlay')
      .attr('width', width).attr('height', height)
      .style('fill', 'none').style('pointer-events', 'all');
  }

  renderTooltipAtCoordinates(pointer: [number, number], x: any, y: any, data: ChartData[], configs: LineConfig[], focus: any, tooltipGroup: any, tooltipRect: any, tooltipText: any, width: number, height: number, colorScale: any) {
    const x0 = x.invert(pointer[0]);
    const bisectDate = d3.bisector<ChartData, Date>(d => d3.isoParse(d.time) || new Date(0)).left;
    const i = bisectDate(data, x0, 1);
    const d0 = data[i - 1]; 
    const d1 = data[i];
    const cursorPosition = pointer[1] <= height / 2 ? 'top' : 'bottom';

    focus.selectAll('.focusCircle').style('display', 'none');

    if (d0 && d1) {
      const date0 = d3.isoParse(d0.time); 
      const date1 = d3.isoParse(d1.time);
      
      if (date0 && date1) {
        const d = x0.getTime() - date0.getTime() > date1.getTime() - x0.getTime() ? d1 : d0;
        const exactDate = d3.isoParse(d.time) || new Date(0);

        focus.select('#focusLineX').attr('x1', x(exactDate)).attr('y1', 0).attr('x2', x(exactDate)).attr('y2', height);
        focus.select('#focusLineY').attr('x1', 0).attr('y1', pointer[1]).attr('x2', width).attr('y2', pointer[1]);

        const visibleConfigs = configs.filter(c => c.visible !== false);

        visibleConfigs.forEach(c => {
          focus.select(`#focusCircle_${c.key}`)
            .style('display', null)
            .attr('cx', x(exactDate))
            .attr('cy', y(+d[c.key]));
        });

        const contentGroup = tooltipGroup.select('.tooltip-content-group');
        contentGroup.selectAll('*').remove();

        let currentY = 18;

        contentGroup.append('text')
          .attr('x', 12)
          .attr('y', currentY)
          .style('fill', 'var(--scada-tooltip-text-muted)')
          .style('font-family', 'sans-serif')
          .style('font-size', '11px')
          .style('font-weight', '600')
          .text(moment(d.time).format("DD.MM.YYYY HH:mm:ss"));

        currentY += 10;

        contentGroup.append('line')
          .attr('x1', 12)
          .attr('y1', currentY)
          .attr('x2', 190)
          .attr('y2', currentY)
          .style('stroke', 'var(--scada-grid-lines)')
          .style('stroke-width', '1px');

        currentY += 16;

        visibleConfigs.forEach(c => {
          const rowG = contentGroup.append('g').attr('transform', `translate(12, ${currentY})`);

          rowG.append('circle').attr('cx', 5).attr('cy', -4).attr('r', 4).style('fill', colorScale(c.key));

          rowG.append('text')
            .attr('x', 16)
            .attr('y', 0)
            .style('fill', 'var(--scada-axis-text)')
            .style('font-family', 'sans-serif')
            .style('font-size', '13px')
            .style('font-weight', '500')
            .text(`${c.label}:`);

          rowG.append('class', 'value-text')
            .attr('class', 'value-text')
            .attr('x', 110)
            .attr('y', 0)
            .style('fill', 'var(--scada-tooltip-text-main)')
            .style('font-family', 'monospace')
            .style('font-size', '13px')
            .style('font-weight', '700')
            .text(Number(d[c.key]).toFixed(2));

          currentY += 20;
        });

        const bbox = contentGroup.node().getBBox();
        const tooltipWidth = Math.max(210, bbox.width + 24);
        const tooltipHeight = bbox.height + 24;

        contentGroup.select('line').attr('x2', tooltipWidth - 12);
        
        contentGroup.selectAll('.value-text').attr('x', tooltipWidth - 24).attr('text-anchor', 'end');

        const tooltipX = pointer[0] > width / 2 ? pointer[0] - tooltipWidth - 15 : pointer[0] + 15;
        const tooltipY = cursorPosition === 'top' ? pointer[1] + 10 : pointer[1] - tooltipHeight - 10;

        tooltipGroup.attr("transform", `translate(${tooltipX},${tooltipY})`).style("opacity", 1);
        
        tooltipRect.attr("width", tooltipWidth).attr("height", tooltipHeight);
      }
    }
  }

  filterDataByDateRange(data: ChartData[], start: Date, end: Date): ChartData[] {
    return data.filter((d) => {
      const time = d3.isoParse(d.time);
      return time && time >= start && time <= end;
    });
  }

  getXScale(data: ChartData[], width: number, daterange?: [Date, Date]): any {
    const extent = this.getTimeExtent(data);
    return d3.scaleTime().domain(daterange || extent).range([0, width]);
  }
}