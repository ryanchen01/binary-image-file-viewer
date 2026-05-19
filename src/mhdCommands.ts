import * as vscode from 'vscode';
import { CONSTANTS } from './constants';

interface MhdCommandServices {
    readonly executeCommand: (command: string, ...args: unknown[]) => Thenable<unknown>;
    readonly showErrorMessage: (message: string) => Thenable<unknown>;
    readonly activeTextEditor?: vscode.TextEditor;
}

const OPEN_WITH_OPTIONS = {
    viewColumn: vscode.ViewColumn.Active,
    preview: false
};

export async function openMhdViewer(uri?: vscode.Uri, ...serviceCandidates: unknown[]): Promise<void> {
    await openMhdWithEditor(CONSTANTS.VIEW_TYPES.MHD_EDITOR, uri, resolveServices(serviceCandidates));
}

export async function openMhdText(uri?: vscode.Uri, ...serviceCandidates: unknown[]): Promise<void> {
    await openMhdWithEditor('default', uri, resolveServices(serviceCandidates));
}

function getDefaultServices(): MhdCommandServices {
    return {
        executeCommand: (command: string, ...args: unknown[]) => vscode.commands.executeCommand(command, ...args),
        showErrorMessage: (message: string) => vscode.window.showErrorMessage(message),
        activeTextEditor: vscode.window.activeTextEditor
    };
}

function resolveServices(candidates: unknown[]): MhdCommandServices {
    const services = candidates.find(isMhdCommandServices);
    if (services) {
        return services;
    }

    return getDefaultServices();
}

function isMhdCommandServices(candidate: unknown): candidate is MhdCommandServices {
    return typeof candidate === 'object' &&
        candidate !== null &&
        'executeCommand' in candidate &&
        typeof candidate.executeCommand === 'function' &&
        'showErrorMessage' in candidate &&
        typeof candidate.showErrorMessage === 'function';
}

async function openMhdWithEditor(editorId: string, uri: vscode.Uri | undefined, services: MhdCommandServices): Promise<void> {
    const targetUri = resolveTargetUri(uri, services);
    if (!isLocalMhdUri(targetUri)) {
        await services.showErrorMessage('Open an MHD file before switching the MHD viewer.');
        return;
    }

    await services.executeCommand('vscode.openWith', targetUri, editorId, OPEN_WITH_OPTIONS);
}

function resolveTargetUri(uri: vscode.Uri | undefined, services: MhdCommandServices): vscode.Uri | undefined {
    return uri ?? services.activeTextEditor?.document.uri;
}

function isLocalMhdUri(uri: vscode.Uri | undefined): uri is vscode.Uri {
    return uri !== undefined &&
        (!uri.scheme || uri.scheme === 'file') &&
        uri.fsPath.toLowerCase().endsWith('.mhd');
}
