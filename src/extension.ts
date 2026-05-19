// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { BinaryImageEditorProvider } from './binaryImageEditorProvider';
import { CONSTANTS } from './constants';
import { openMhdText, openMhdViewer } from './mhdCommands';

/**
 * Called when the extension is activated. This happens the first time the
 * command is executed or when a registered file type is opened.
 *
 * @param context VS Code extension context used for subscriptions and access
 * to extension resources.
 */
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "binary-image-file-viewer" is now active!');

	// Register the custom editor provider
	const provider = new BinaryImageEditorProvider(context);
	const providerRegistration = vscode.window.registerCustomEditorProvider(
		CONSTANTS.VIEW_TYPES.BINARY_EDITOR,
		provider,
		{
			webviewOptions: {
				retainContextWhenHidden: true,
			},
			supportsMultipleEditorsPerDocument: false,
		}
	);
	const mhdProviderRegistration = vscode.window.registerCustomEditorProvider(
		CONSTANTS.VIEW_TYPES.MHD_EDITOR,
		provider,
		{
			webviewOptions: {
				retainContextWhenHidden: true,
			},
			supportsMultipleEditorsPerDocument: false,
		}
	);

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand(CONSTANTS.COMMANDS.HELLO_WORLD, () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Binary Image File Viewer!');
	});
	const openMhdViewerCommand = vscode.commands.registerCommand(CONSTANTS.COMMANDS.OPEN_MHD_VIEWER, openMhdViewer);
	const openMhdTextCommand = vscode.commands.registerCommand(CONSTANTS.COMMANDS.OPEN_MHD_TEXT, openMhdText);

	context.subscriptions.push(
		providerRegistration,
		mhdProviderRegistration,
		disposable,
		openMhdViewerCommand,
		openMhdTextCommand
	);
}

/**
 * Clean up resources when the extension is deactivated. Currently this
 * extension has no teardown logic but the function is provided for
 * completeness.
 */
export function deactivate() {}
