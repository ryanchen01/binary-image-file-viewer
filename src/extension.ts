import * as vscode from 'vscode';
import { BinaryImageEditorProvider } from './binaryImageEditorProvider';
import { CONSTANTS } from './constants';
import { openMhdText, openMhdViewer } from './mhdCommands';

export function activate(context: vscode.ExtensionContext): void {
    const provider = new BinaryImageEditorProvider();
    for (const viewType of Object.values(CONSTANTS.VIEW_TYPES)) {
        context.subscriptions.push(vscode.window.registerCustomEditorProvider(
            viewType,
            provider,
            {
                webviewOptions: { retainContextWhenHidden: true },
                supportsMultipleEditorsPerDocument: false
            }
        ));
    }
    context.subscriptions.push(
        vscode.commands.registerCommand(CONSTANTS.COMMANDS.OPEN_MHD_VIEWER, openMhdViewer),
        vscode.commands.registerCommand(CONSTANTS.COMMANDS.OPEN_MHD_TEXT, openMhdText)
    );
}
