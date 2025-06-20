// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { BinaryImageEditorProvider } from './binaryImageEditorProvider';

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
		'binaryImageViewer.editor',
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
	const disposable = vscode.commands.registerCommand('binary-image-file-viewer.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from Binary Image File Viewer!');
	});

	context.subscriptions.push(providerRegistration, disposable);
}

/**
 * Clean up resources when the extension is deactivated. Currently this
 * extension has no teardown logic but the function is provided for
 * completeness.
 */
export function deactivate() {}
