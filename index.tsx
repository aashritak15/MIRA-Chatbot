/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {GoogleGenAI, Chat} from '@google/genai';

// --- DOM Element References ---
const chatHistory = document.getElementById('chat-history') as HTMLDivElement;
const chatForm = document.getElementById('chat-form') as HTMLFormElement;
const chatInput = document.getElementById('chat-input') as HTMLInputElement;
const micButton = document.getElementById('mic-button') as HTMLButtonElement;
const slowModeToggle = document.getElementById(
  'slow-mode',
) as HTMLInputElement;

// --- Speech Recognition & Synthesis Setup ---
const SpeechRecognitionAPI =
  (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
let recognition: SpeechRecognition | null = null;
if (SpeechRecognitionAPI) {
  recognition = new SpeechRecognitionAPI();
  recognition.continuous = false;
  recognition.lang = 'en-US';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
} else {
  console.warn('Speech Recognition not supported in this browser.');
  micButton.style.display = 'none';
}

const synth = window.speechSynthesis;

// --- Gemini AI Setup ---
const API_KEY = "AIzaSyBhvGHSNCbFfbGf7F65ZY-lUqZZEl1-KsU";
if (!API_KEY) {
  appendMessage(
    'Error: The API_KEY environment variable is not set. Please configure it to use the application.',
    'mira',
  );
  throw new Error('API_KEY not set');
}

const ai = new GoogleGenAI({apiKey: API_KEY});
const MIRA_PERSONA =
  'You are MIRA, a warm and emotionally supportive assistant for older adults. ' +
  'Your responses should always be concise, friendly, calm, and easy to understand. ' +
  'Avoid technical jargon. Keep your answers short and to the point.';

const chat: Chat = ai.chats.create({
  model: 'gemini-2.5-flash',
  config: {
    systemInstruction: MIRA_PERSONA,
  },
});

// --- State Management ---
let isListening = false;
let isSpeaking = false;
let loadingMessageElement: HTMLDivElement | null = null;

// --- Core Functions ---

/**
 * Appends a message to the chat history UI.
 * @param text The message text to display.
 * @param sender 'user' or 'mira'.
 * @returns The created message element.
 */
function appendMessage(
  text: string,
  sender: 'user' | 'mira',
): HTMLDivElement {
  const messageElement = document.createElement('div');
  messageElement.classList.add('message', sender);
  messageElement.textContent = text;
  chatHistory.appendChild(messageElement);
  chatHistory.scrollTop = chatHistory.scrollHeight; // Auto-scroll
  return messageElement;
}

/**
 * Creates and appends a loading indicator for MIRA's response.
 */
function showLoadingIndicator() {
  if (loadingMessageElement) return;
  loadingMessageElement = document.createElement('div');
  loadingMessageElement.classList.add('message', 'mira', 'loading');
  loadingMessageElement.innerHTML = `
    <div class="loading-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  chatHistory.appendChild(loadingMessageElement);
  chatHistory.scrollTop = chatHistory.scrollHeight;
}

/**
 * Removes the loading indicator.
 */
function hideLoadingIndicator() {
  if (loadingMessageElement) {
    loadingMessageElement.remove();
    loadingMessageElement = null;
  }
}

/**
 * Speaks the given text using the Web Speech API.
 * @param text The text to be spoken.
 */
function speak(text: string) {
  if (isSpeaking) {
    synth.cancel();
  }
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = slowModeToggle.checked ? 0.8 : 1.0;
  utterance.pitch = 1.0;
  utterance.volume = 1.0;
  utterance.onstart = () => {
    isSpeaking = true;
  };
  utterance.onend = () => {
    isSpeaking = false;
  };
  synth.speak(utterance);
}

/**
 * Sends a message to the Gemini API and handles the response.
 * @param message The user's message.
 */
async function sendMessageToMira(message: string) {
  if (!message.trim()) return;

  appendMessage(message, 'user');
  chatInput.value = '';
  showLoadingIndicator();

  try {
    const response = await chat.sendMessage({message});
    hideLoadingIndicator();
    const miraResponse = response.text;
    appendMessage(miraResponse, 'mira');
    speak(miraResponse);
  } catch (error) {
    console.error('Error sending message to Gemini:', error);
    hideLoadingIndicator();
    const errorMessage =
      'I apologize, but I had a little trouble connecting. Could you please try again?';
    appendMessage(errorMessage, 'mira');
    speak(errorMessage);
  }
}

// --- Event Listeners ---

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  sendMessageToMira(chatInput.value);
});

if (recognition) {
  micButton.addEventListener('click', () => {
    if (isListening) {
      recognition?.stop();
      return;
    }
    synth.cancel(); // Stop any ongoing speech
    recognition?.start();
  });

  recognition.onstart = () => {
    isListening = true;
    micButton.classList.add('listening');
    micButton.setAttribute('aria-label', 'Stop listening');
  };

  recognition.onend = () => {
    isListening = false;
    micButton.classList.remove('listening');
    micButton.setAttribute('aria-label', 'Use microphone');
  };

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript;
    chatInput.value = transcript;
    sendMessageToMira(transcript);
  };

  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);

    // Don't show an error if recognition was manually stopped by the user.
    if (event.error === 'aborted') {
      return;
    }

    let errorMessage: string;

    switch (event.error) {
      case 'network':
        errorMessage =
          "I'm having trouble connecting to the voice service. Could you please check your internet connection and try again?";
        break;
      case 'no-speech':
        errorMessage =
          "I didn't seem to hear anything. Please try speaking again.";
        break;
      case 'not-allowed':
      case 'service-not-allowed':
        errorMessage =
          'It seems I do not have permission to use your microphone. You may need to allow it in your browser settings.';
        break;
      default:
        errorMessage =
          "I'm sorry, I couldn't quite understand that. Please try again.";
        break;
    }

    appendMessage(errorMessage, 'mira');
    speak(errorMessage);
  };
}

// --- Initial Greeting ---
window.addEventListener('load', () => {
  // A small delay ensures voices are loaded, especially on first load.
  setTimeout(() => {
    const welcomeMessage = "Hello, I'm MIRA. How can I help you today?";
    appendMessage(welcomeMessage, 'mira');
    speak(welcomeMessage);
  }, 500);
});
