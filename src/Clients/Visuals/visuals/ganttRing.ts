/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved. 
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *   
 *  The above copyright notice and this permission notice shall be included in 
 *  all copies or substantial portions of the Software.
 *   
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

/* Please make sure that this path is correct */
/// <reference path="../_references.ts"/>

module powerbi.visuals {
    import SelectionManager = utility.SelectionManager;
    import ClassAndSelector = jsCommon.CssConstants.ClassAndSelector;
    import createClassAndSelector = jsCommon.CssConstants.createClassAndSelector;

    export interface IGanttTask {
        name: string;
        startAngle: number; // radians
        endAngle: number; // radians
        layer: number; // int
        color?: string;
        progress: number; //percent
        selector?: SelectionId;
        tooltip?: TooltipDataItem[];
    }

    export interface IGantt {
        tasks: IGanttTask[];
        layers: number; //int
        compress: boolean; //bool
        progress: number; //percent
        progressAngle: number; //radians
    };

    export class GanttRing implements IVisual {

        private static TaskSlice: ClassAndSelector = createClassAndSelector('ganttTaskSlice');
        private static ProgressSlice: ClassAndSelector = createClassAndSelector('ganttProgressSlice');
        private static ProgressText: ClassAndSelector = createClassAndSelector('ganttProgressText');
        private static ProgressSliceSelectionId = new SelectionId({ id: 'progressSliceId' }, false);
        private static ProgressTextSelectionId = new SelectionId({ id: 'progressTextId' }, false);
        private static CenterSize = 3;
        private static SvgClassName = 'gantt';
        private static properties = {
            layoutCompression: { objectName: 'layout', propertyName: 'compress' },
            progressFill: { objectName: 'progress', propertyName: 'fill' },
        };
        private colors: IDataColorPalette;
        private selectionManager: SelectionManager;
        private svg: D3.Selection;
        private g: D3.Selection;
        private totalProgress: string;
        private progressFill: string;
        private transitionDuration: number;

		/**
		  * Informs the System what it can do Fields, Formatting options, data reduction & QnA hints
		  */
        public static capabilities: VisualCapabilities = {
            dataRoles: [
                {
                    name: 'Task',
                    displayName: 'Task',
                    kind: VisualDataRoleKind.Grouping
                },
                {
                    name: 'Start',
                    displayName: 'Start Timestamp',
                    preferredTypes: [{ dateTime: true }],
                    kind: VisualDataRoleKind.Measure
                },
                {
                    name: 'End',
                    displayName: 'End Timestamp',
                    preferredTypes: [{ dateTime: true }],
                    kind: VisualDataRoleKind.Measure
                }
            ],
            dataViewMappings: [{
                conditions: [
                    {
                        'Task': { min: 0, max: 1 },
                        'Start': { min: 0, max: 1 },
                        'End': { min: 0, max: 1 }
                    }
                ],
                categorical: {
                    categories: {
                        for: { in: 'Task' }
                    },
                    values: {
                        select: [{ bind: { to: 'Start' } }, { bind: { to: 'End' } }]
                    },
                    //values: {
                    //    //group: {
                    //    //    by: 'Task',
                    //    //    select: [{ bind: { to: 'Start' } }, { bind: { to: 'End' } }]
                    //    //    //select: [{ for: { in: 'Start' } }, { for: { in: 'End' } }]
                    //    //}

                    //    select: [{ bind: { to: 'Start' } }, { bind: { to: 'End' } }]
                    //    //select: [{ for: { in: 'Start' } }, { for: { in: 'End' } }]
                    //},
                },
                table: {
                    rows: {
                        select: [{ for: { in: 'Task' } }, { for: { in: 'Start' } }, { for: { in: 'End' } }]
                    }
                }
            }],
            objects: {
                layout: {
                    displayName: 'Layout',
                    properties: {
                        compress: {
                            displayName: 'Compress Tasks',
                            type: { bool: true }
                        }
                    }
                },
                progress: {
                    displayName: 'Progress',
                    properties: {
                        fill: {
                            displayName: 'Fill',
                            type: { fill: { solid: { color: true } } }
                        }
                    }
                }
            }
        };
		
		/**
		  * Initialize gantt
		  */
        public init(options: VisualInitOptions): void {
            this.selectionManager = new SelectionManager({ hostServices: options.host });
            this.colors = options.style.colorPalette.dataColors;
            this.svg = d3.select(options.element.get(0))
                .append('svg')
                .classed(GanttRing.SvgClassName, true)
                .on('click', () => this.clearSelection());
            this.g = this.svg.append('g');
        }
        		
		/**
		  * update gantt with new data, format, or size
		  */
        public update(options: VisualUpdateOptions) {
            //if there is no data, do nothing.
            if (options.dataViews.length > 0) {
                //convert our dataview to a more usable form
                var data = GanttRing.converter(options.dataViews[0], this.colors.getNewColorScale());
                this.progressFill = GanttRing.getProgressFill(options.dataViews[0]).solid.color;
                this.transitionDuration = options.suppressAnimations ? 0 : AnimatorCommon.MinervaAnimationDuration;
                this.draw(data, options.viewport);
            }
        }

        /*
         * Called when visual should cleanup. It is about to be destroyed
        */
        public destroy() {
            //enusre that any event handles are cleaned up
            this.svg.on('click', null);
            this.g.selectAll(GanttRing.TaskSlice.selector).on('click', null);
        }
		
		/**
		  * draw changes to the gantt
		  */
        private draw(gantt: IGantt, viewport: IViewport) {

            //stretch svg to the viewport size
            this.svg.attr({
                'height': viewport.height,
                'width': viewport.width
            });

            //center the main group
            this.g.attr('transform', SVGUtil.translate(viewport.width / 2, viewport.height / 2));
						
            //calculate the radius or the largest possible arc that fits squarly within the viewport.
            var radius = Math.min(viewport.width, viewport.height) / 2;            

            //calculate the height of the arcs (inner radius to outer radius distance), plus account for the center circles empty space.
            var arcHeight = radius / (gantt.layers + GanttRing.CenterSize);
            var centerRadius = arcHeight * GanttRing.CenterSize;

            //create/update task paths: 
            var paths = this.g.selectAll(GanttRing.TaskSlice.selector).data(gantt.tasks, d => d.selector.getKey());
            var arc = d3.svg.arc()
                .innerRadius(d => (centerRadius) + (d.layer * arcHeight))
                .outerRadius(d => (arcHeight * (GanttRing.CenterSize + 1)) + (d.layer * arcHeight))
                .startAngle(d => d.startAngle)
                .endAngle(d => d.endAngle);
            this.drawTasks(paths, arc);
                       
            //create/update progress: 
            var progressArc = d3.svg.arc()
                .innerRadius(centerRadius)
                .outerRadius(arcHeight * (GanttRing.CenterSize + gantt.layers))
                .startAngle(0)
                .endAngle(gantt.progressAngle);

            this.totalProgress = this.getTotalProgressLabel(gantt.tasks.length, gantt.progress);
            this.drawProgress(gantt.progressAngle, centerRadius, progressArc);

            //update selection visuals
            this.updateSelection();
        }

        private getTotalProgressLabel(tasksCount: number, progress: number): string {

            if (tasksCount === 0) {
                return 'Project Has No Tasks';
            }
            else if (progress <= 0) {
                return 'Not Started';
            } else if (progress >= 100) {
                return 'Completed';
            } else {
                return progress + '%';
            }

        }
        
		/**
		  * draw changes to tasks
		  */
        private drawTasks(paths: D3.UpdateSelection, arc: D3.Svg.Arc) {            
            //create paths for new tasks
            paths.enter()
                .append('path')
                .style('stroke', '#fff')
                .style('stroke-width', 1)
                .style('fill', d=> d.color)
                .classed(GanttRing.TaskSlice.class, true)
                .on('click', d => {
                    this.selectionManager.select(d.selector).then(ids => this.updateSelection());
                    d3.event.stopPropagation();
                });

            //exit old tasks
            paths.exit()
                .remove()
                .on('click', null);

            //add tooltips for each task
            TooltipManager.addTooltip(paths, (tooltipEvent: TooltipEvent) => {
                return (<IGanttTask>tooltipEvent.data).tooltip;
            });
			
            //update task arcs
            paths.transition()
                .duration(this.transitionDuration)
                .attr('d', arc);

        }
        
		/**
		  * draw changes to progress
		  */
        private drawProgress(progressAngle: number, centerRadius: number, arc: D3.Svg.Arc) {
            //create progress indicator
            var progressPath = this.g
                .selectAll(GanttRing.ProgressSlice.selector)
                .data([progressAngle], d => GanttRing.ProgressSliceSelectionId.getKey());
		   
            //Create any new progress data
            progressPath.enter()
                .append('path')
                .style({
                    'opacity': 0.4,
                    'fill': this.progressFill,
                    'pointer-events': 'none'
                })
                .classed(GanttRing.ProgressSlice.class, true);
			
            //exit old progress data
            progressPath.exit().remove();

            //update progress data
            progressPath
                .transition()
                .duration(this.transitionDuration)
                .attr('d', arc);

            var progressText = this.g
                .selectAll(GanttRing.ProgressText.selector)
                .data([this.totalProgress], d => GanttRing.ProgressTextSelectionId.getKey());

            progressText.enter()
                .append('text')
                .classed(GanttRing.ProgressText.class, true)
                .style({
                    'line-height': 1,
                    'font-weight': 'bold'
                })
                .attr({
                    'text-anchor': 'middle'
                })
                .text(this.totalProgress);

            progressText
                .transition()
                .duration(this.transitionDuration)
                .style('font-size', centerRadius * 0.4);

            //exit old progress text data
            progressText.exit().remove();
        }
        
        /**
		  * Clears the selection, then updates the visual elements
		  */
        private clearSelection() {
            this.selectionManager.clear().then(() => this.updateSelection(true));
        }

        /**
		  * updates the selection visual elements
		  */
        private updateSelection(isClear: boolean = false) {
            var Ids = this.selectionManager.getSelectionIds();
            var paths = this.g.selectAll(GanttRing.TaskSlice.selector);
            var tasks = paths.data();
            var selection = Ids.length === 0 ? [] : tasks.filter(t => t.selector === Ids[0]);
            if (selection.length === 0 && Ids.length > 0) {
                this.clearSelection();
            } else {

                var progressTransition = this.g
                    .selectAll(GanttRing.ProgressText.selector)
                    .transition()
                    .duration(this.transitionDuration);

                if (selection.length > 0) {
                    var task: IGanttTask = selection[0];

                    paths
                        .transition()
                        .duration(this.transitionDuration)
                        .style('opacity', d => d.selector === task.selector ? 1 : 0.5)
                        .style('stroke', d => d.selector === task.selector ? '#000' : '#fff')
                        .style('stroke-width', d => d.selector === task.selector ? 2 : 1);

                    progressTransition
                        .style('fill', task.color)
                        .text(task.progress + '%');
                } else {

                    if (isClear) {
                        paths
                            .transition()
                            .duration(this.transitionDuration)
                            .style('opacity', 1)
                            .style('stroke', '#fff')
                            .style('stroke-width', 1);
                    }

                    progressTransition
                        .style('fill', this.progressFill)
                        .text(this.totalProgress);
                }
            }
        }
        
        /** 
          * Retrives the layout compression setting from the dataviews metadata
          */
        private static compressLayout(dataView: DataView): boolean {
            return dataView.metadata && DataViewObjects.getValue(dataView.metadata.objects, GanttRing.properties.layoutCompression, false);
        }

        /** 
          * Retrives the progress fill setting from the dataviews metadata
          */
        private static getProgressFill(dataView: DataView): Fill {
            var defaultFill = { solid: { color: '#060' } };
            return !dataView.metadata ? defaultFill : DataViewObjects.getValue(dataView.metadata.objects, GanttRing.properties.progressFill, defaultFill);
        }

        private static buildGantTasks(gantt: IGantt, names: string[], starts: any[], ends: any[], colors: IColorScale, getSelectionId: (task: IGanttTask, i: number) => SelectionId): void {
            var start: number = starts.reduce((prev, curr) => prev < curr ? prev : curr).valueOf();
            var end: number = ends.reduce((prev, curr) => prev > curr ? prev : curr).valueOf();
            var duration: number = Math.abs(end - start);
            var layers: IGanttTask[][] = [[]];

            gantt.tasks = names.map((name, i) => {
                var taskStart = starts[i] instanceof Date ? starts[i] : new Date(starts[i]);
                var taskEnd = ends[i] instanceof Date ? ends[i] : new Date(ends[i]);
                var taskStartValue = taskStart.valueOf();
                var taskEndValue = taskEnd.valueOf();
                var taskDuration = taskEndValue - taskStartValue;
                var completed = Math.max(Date.now(), taskStartValue) - taskStartValue;
                var progress = Math.round(GanttRing.calcPercent(completed, taskDuration));

                var tooltip: TooltipDataItem[] = [
                    {
                        displayName: 'Name',
                        value: name
                    }, {
                        displayName: 'Start',
                        value: taskStart.toLocaleDateString()
                    }, {
                        displayName: 'End',
                        value: taskEnd.toLocaleDateString()
                    }, {
                        displayName: 'Progress',
                        value: progress + '%'
                    }];

                //Create Gantt Task
                var task: IGanttTask = {
                    name: name,
                    tooltip: tooltip,
                    layer: -1,
                    progress: progress,
                    color: colors.getColor(name).value,
                    startAngle: GanttRing.calcTaskRadians(taskStartValue - start, duration, true),
                    endAngle: GanttRing.calcTaskRadians(taskEndValue - start, duration)
                };

                task.selector = getSelectionId(task, i);

                if (gantt.compress) {
                    //compact the layers of the ghant to fit as tight as possible
                    for (var l = 0; l < layers.length; l++) {

                        //see if there is enough space in this row
                        var hasRoom = layers[l].every(t => (t.startAngle >= task.endAngle || t.endAngle <= task.startAngle));

                        if (hasRoom) {
                            task.layer = l;
                            layers[l].push(task);
                            break;
                        }
                    }

                    if (task.layer === -1) {
                        layers.push([task]);
                        task.layer = layers.length - 1;
                    }
                } else {
                    task.layer = i;
                }

                //Return the gantt task
                return task;
            });

            gantt.layers = gantt.compress ? layers.length : gantt.tasks.length;

            var progress = Math.max(Date.now(), start) - start;
            gantt.progress = Math.round(GanttRing.calcPercent(progress, duration));
            gantt.progressAngle = GanttRing.calcTaskRadians(progress, duration);
        }
				
		/**
		  * Convert DataView to IGantt
		  */
        private static converter(dataView: DataView, colors: IColorScale): IGantt {
            var gantt: IGantt = { tasks: [], layers: 0, progress: 0, progressAngle: 0, compress: GanttRing.compressLayout(dataView) };

            //if (dataView.table && dataView.table.columns && dataView.table.columns.length === 3 && dataView.table.rows && dataView.table.rows.length > 0) {

            //    var data = { names: [], starts: [], ends: [] };
            //    dataView.table.rows.forEach(row => {
            //        data.names.push(row[0]);
            //        data.starts.push(row[1]);
            //        data.ends.push(row[2]);
            //    });
            //    var identities = dataView.table.identity;
            //    this.buildGantTasks(gantt, data.names, data.starts, data.ends, colors,
            //        (task, i) => identities ? SelectionId.createWithId(identities[i]) : SelectionId.createWithMeasure(task.name, false));
            //}
            if (dataView.categorical && dataView.categorical.categories && dataView.categorical.categories.length > 0) {
                var categoryView: DataViewCategorical = dataView.categorical;
                var category = categoryView.categories[0];
                var names = category.values;

                if (categoryView.values && categoryView.values.length >= 2) {
                    var starts: any[] = categoryView.values[0].values;
                    var ends: any[] = categoryView.values[1].values;

                    this.buildGantTasks(gantt, names, starts, ends, colors, (task, i) => SelectionId.createWithId(category.identity[i]));
                }
            }

            return gantt;
        }

		/**
		  * Calculates what precent 'value' is of 'total' (caps return value at 100%)
		  */
        private static calcPercent(value: number, total: number, overflowValue: number = 100) {
            return value >= total ? overflowValue : value / (total / 100);
        }
		 
		/**
		  * Calculates the angle of a value as a percentage of the duration and returns the result in radians.
		  */
        private static calcTaskRadians(value: number, duration: number, defaultToZero: boolean = false) {
            //get percent that vlaue represents of duration
            var percent = GanttRing.calcPercent(value, duration, defaultToZero ? 0 : 100);
            //convert percent into degrees
            var degrees = percent * 3.6;
            //convert degrees to radians
            return degrees * Math.PI / 180;
        }
    }
}

/* Creating IVisualPlugin that is used to represent IVisual. */
//
// Uncomment it to see your plugin in "PowerBIVisualsPlayground" plugins list
// Remember to finally move it to plugins.ts
//
module powerbi.visuals.plugins {
    export var ganttRing: IVisualPlugin = {
        name: 'ganttRing',
        capabilities: GanttRing.capabilities,
        create: () => new GanttRing()
    };
}