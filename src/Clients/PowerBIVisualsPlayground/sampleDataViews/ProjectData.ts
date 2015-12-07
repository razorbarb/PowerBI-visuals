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

/// <reference path="../_references.ts"/>

module powerbi.visuals.sampleDataViews {
    import DataViewTransform = powerbi.data.DataViewTransform;

    export class ProjectData extends SampleDataViews implements ISampleDataViewsMethods {

        constructor() {
            super();
            this.sampleData[0] = this.generateTasks(15);
            this.randomize();
        }

        public name: string = "ProjectData";
        public displayName: string = "Project Data";
        public visuals: string[] = ['ganttRing'];

        //sample data holds 2 columns, task name, start timestamps and end timestamps)
        private sampleData: (string | Date)[][] = [[], [], []];

        private oneDayMs = 86400000;//one day in ms
        private minDiffDays = 1;
        private maxDiffDays = 28;

        private generateTasks(count: number): string[] {
            var tasks: string[] = [];

            for (let i = 0; i < count; i++) {
                tasks.push('Task ' + i);
            }

            return tasks;
        }

        public getDataViews(): DataView[] {
            //create identity
            let fieldExpr = powerbi.data.SQExprBuilder.fieldExpr({ column: { schema: 's', entity: "table1", name: "task" } });
            let categoryIdentities = this.sampleData[0].map(function (value: string) {
                let expr = powerbi.data.SQExprBuilder.equal(fieldExpr, powerbi.data.SQExprBuilder.text(value));
                return powerbi.data.createDataViewScopeIdentity(expr);
            });
            let seriesIdentityField = powerbi.data.SQExprBuilder.fieldExpr({ column: { schema: 's', entity: 'e', name: 'series' } });
            
            //create metadata
            let dataViewMetadata: powerbi.DataViewMetadata = {
                columns: [
                    {
                        displayName: 'Task',
                        queryName: 'task',
                        type: powerbi.ValueType.fromDescriptor({ text: true })
                    },
                    {
                        displayName: 'Start Date',
                        queryName: 'start',
                        format: "MM/dd/yyyy",
                        type: powerbi.ValueType.fromDescriptor({ dateTime: true })
                    },
                    {
                        displayName: 'End Date',
                        queryName: 'end',
                        format: "MM/dd/yyyy",
                        type: powerbi.ValueType.fromDescriptor({ dateTime: true })
                    }
                ],
                objects: {
                    //layout: { compress: false },
                    //progress: { fill: { solid: { color: '#600' } } }
                }
            };

            //create columns
            let columns = [
                // Start Dates
                {
                    source: dataViewMetadata.columns[1],
                    values: this.sampleData[1],
                },
                // End Dates
                {
                    source: dataViewMetadata.columns[2],
                    values: this.sampleData[2],
                }
            ];

            //create data values from columns
            let dataValues: DataViewValueColumns = DataViewTransform.createValueColumns(columns);
            let tableDataValues = this.sampleData[0].map((taskName, idx) => {
                return [taskName, this.sampleData[1][idx], this.sampleData[2][idx]];
            });

            return [{
                metadata: dataViewMetadata,
                categorical: {
                    categories: [{
                        source: dataViewMetadata.columns[0],
                        values: this.sampleData[0],
                        identity: categoryIdentities,
                        identityFields: [seriesIdentityField]
                    }],
                    values: dataValues
                },
                table: {
                    rows: tableDataValues,
                    columns: dataViewMetadata.columns,
                }
            }];
        }

        /*
        * Randomize task start and end dates. start dates will be between 1-28 days before today and end dates will be between 1-28 days after the corrosponding start date.
        */
        public randomize(): void {
            let startDateMs = Date.now() - this.getRandomValue(this.minDiffDays, this.maxDiffDays) * this.oneDayMs;

            this.sampleData[0].forEach((v, i) => {
                let taskStartMs = startDateMs + (this.getRandomValue(this.minDiffDays, this.maxDiffDays) * this.oneDayMs);
                let taskEndMs = taskStartMs + (this.getRandomValue(this.minDiffDays, this.maxDiffDays) * this.oneDayMs);
                let start = new Date(taskStartMs);
                let end = new Date(taskEndMs);
                this.sampleData[1][i] = start;
                this.sampleData[2][i] = end;
            });
        }
    }
}