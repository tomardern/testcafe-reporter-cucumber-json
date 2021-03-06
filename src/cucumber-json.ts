import { cliArgs } from "./command-line-args";
import { IBrowser, ICucumberJsonReport, IFeatureReport, INameVersion,
    IPlatform, IScenario, IStep, StepStatus, testcafeDefaultStep } from "./cucumber-json-interface";
import { ITestRunInfo } from "./reporter-interface";
import { tagsFromPhrase } from "./tags-parser";
import { getBrowserFrom, getDeviceFrom, getPlatformFrom } from "./user-agent-parser";
export class CucumberJsonReport implements ICucumberJsonReport {
    // tslint:disable:variable-name
    private _startTime: Date = new Date();
    private _endTime: Date = new Date();
    private _userAgents: string[] = [];
    private _testCount: number = 0;
    private _passed!: number;
    private _warnings!: string[];
    private _features: IFeatureReport[] = [];
    private _currentFeature: IFeatureReport | undefined;
    private _currentScenario: IScenario | undefined;
    private _currentStep: IStep | undefined;
    private _currentPlatform!: IPlatform;
    private _currentApp!: INameVersion;
    private _currentBrowser!: IBrowser;
    private _currentDevice: string = "unknown";

    public get currentFeature(): IFeatureReport | undefined {
        return this._currentFeature;
    }
    public set currentFeature(v: IFeatureReport | undefined) {
        if (v === undefined) {
            return;
        }
        this._currentFeature = v;
        this._features.push(v);
        this._currentScenario = undefined;
    }
    public get currentScenario(): IScenario | undefined {
        return this._currentScenario;
    }
    public set currentScenario(v: IScenario | undefined) {
        if (v === undefined) {
            return;
        }
        this._currentScenario = v;
        if (this._currentFeature && this._currentFeature.elements) {
            this._currentFeature.elements.push(v);
        }
    }

    public get currentStep(): IStep | undefined {
        return this._currentStep;
    }
    public set currentStep(v: IStep | undefined) {
        if (v === undefined) {
            return;
        }
        this._currentStep = v;
        if (this.currentScenario && this.currentScenario.steps) {
            this.currentScenario.steps.push(v);
        }
        if (v.result && v.result.status === "failed"  && this.currentScenario) {
            this.currentScenario.status = "failed";
        }
    }

    public initializeWith = (startTime: Date, userAgents: string[], testCount: number) => {
        this._startTime = startTime;
        this._userAgents = userAgents;
        this._testCount = testCount;
        this._features = [];
        this._currentFeature = undefined;
        this._currentScenario = undefined;
        this._currentStep = undefined;
        this._currentPlatform = getPlatformFrom(userAgents[0]);
        this._currentDevice = getDeviceFrom(userAgents[0]);
        this._currentBrowser = getBrowserFrom(userAgents[0]);
        this._currentApp = {name: cliArgs.appName, version: cliArgs.appVersion};
        return this;
    }

    public finalizeWith = (endTime: Date, passed: number, warnings: string[]) => {
        this._endTime = endTime;
        this._passed = passed;
        this._warnings = warnings;
        if (this.currentFeature) {
            this.currentFeature.runInfo = {
                endTime: this._endTime,
                passed: this._passed,
                startTime: this._startTime,
                testCount: this._testCount,
                userAgents: this._userAgents,
                warnings: this._warnings,
            };
        }
        return this;
    }
    public toJson = () => {
        try {
            const json = JSON.stringify(this._features, null, 2);
            return json;
        } catch (error) {
            return JSON.stringify(error, null, 2);
        }
    }
    public toInfo = () => {
        const result = `
            StartTime : ${this._startTime}
            EndTime   : ${this._endTime}
            UserAgents: ${this._userAgents}
            TestCount : ${this._testCount}
            Passed    : ${this._passed}
            Warnings  : ${this._warnings}
        `;
        return result;
    }
    public createFeature = (name: string, path: string) => {
        const index = 0;
        const featureReport: IFeatureReport = {
            description: name || "",
            elements: [],
            id: this.getFeatureIdFrom(name),
            keyword: "Feature",
            line: 0,
            metadata: {
                app: this._currentApp,
                browser: this._currentBrowser,
                device: this._currentDevice,
                platform: this._currentPlatform,
            },
            name: name || "undefined",
            runInfo: undefined,
            skipped: false,
            tags: tagsFromPhrase(name),
            uri: `${path}:${index + 1}`,
        };
        this.currentFeature = featureReport;
        return this;
    }
    public createScenario = (name: string, testRunInfo: ITestRunInfo) => {
        const scenarioId = this.getScenarioIdFrom(name);
        const scenario: IScenario = {
            id: `Scenario${scenarioId}`,
            keyword: "Scenario",
            line: 0,
            name: name || "undefined",
            skipped: testRunInfo.skipped,
            sourceLine: "undefined",
            status: "passed",
            steps: [],
            tags: [],
            type: "scenario",
            uri: "",
        };
        this.currentScenario = scenario;
        this.currentStep = this.createDefaultStep(name, testRunInfo);
        return this;
    }
    public withError = (error: string) => {
        if (this.currentStep) {
            this.currentStep.result.error_message = error;
        }
        return this;
    }
    public withScreenshots = (paths: string[] | undefined) => {
        if (paths && this.currentStep) {
            this.currentStep.image = paths;
        }
        return this;
    }
    private createDefaultStep = (name: string, testRunInfo: ITestRunInfo): IStep => {
        let stepStatus: StepStatus = testRunInfo.skipped
                            ? "skipped"
                            : "passed";
        if (testRunInfo.errs && testRunInfo.errs.length > 0) {
            stepStatus = "failed";
        }

        const sourceLine = name;
        const sourceLineIndex: number = 0;

        const step: IStep = {
            ...testcafeDefaultStep,
            name: sourceLine || "undefined",
            result: {
              duration: testRunInfo.durationMs,
              error_message: undefined,
              status: stepStatus,
            },
            text: `<a href="#">${sourceLine || ""}</a>`,
        };
        if (this.currentFeature) {
            step.match = {
                location: `${this.currentFeature.uri}:${sourceLineIndex || 0}`,
            };
        }
        return step;
    }

    private getScenarioIdFrom = (scenarioName: string): string => {
        const result = this.currentFeature && this.currentFeature.name
                        ? `${this.currentFeature.name};${scenarioName}`
                        : scenarioName;
        // TODO: ensure this generated id is unique: if not prefix with filename
        return result;
    }

    private getFeatureIdFrom = (featureName: string): string => {
        const result = featureName
                        ? featureName
                        : `Feature${this._features.length + 1}`;
        // TODO: ensure this generated id is unique: if not prefix with filename
        return result;
    }
}
