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

function resolveServices(candidates: unknown[]): MhdCommandServices {
    const services = candidates.find((candidate): candidate is MhdCommandServices =>
        typeof candidate === 'object' &&
        candidate !== null &&
        'executeCommand' in candidate &&
        typeof candidate.executeCommand === 'function' &&
        'showErrorMessage' in candidate &&
        typeof candidate.showErrorMessage === 'function'
    );
    if (services) {
        return services;
    }

    return {
        executeCommand: (command: string, ...args: unknown[]) => vscode.commands.executeCommand(command, ...args),
        showErrorMessage: (message: string) => vscode.window.showErrorMessage(message),
        activeTextEditor: vscode.window.activeTextEditor
    };
}

async function openMhdWithEditor(editorId: string, uri: vscode.Uri | undefined, services: MhdCommandServices): Promise<void> {
    const targetUri = uri ?? services.activeTextEditor?.document.uri;
    if (!targetUri || (targetUri.scheme && targetUri.scheme !== 'file') ||
        !targetUri.fsPath.toLowerCase().endsWith('.mhd')) {
        await services.showErrorMessage('Open an MHD file before switching the MHD viewer.');
        return;
    }

    await services.executeCommand('vscode.openWith', targetUri, editorId, OPEN_WITH_OPTIONS);
}
