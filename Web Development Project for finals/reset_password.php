<?php
// ---------- PHP LOGIC AT TOP ----------
$msg = '';
$msgClass = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = trim($_POST['email'] ?? '');

    if ($email === '') {
        $msg = '❌ Please enter your email.';
        $msgClass = 'error';
    } else {
        // 🔑 Your Firebase Web API key (from Firebase Project Settings → Web API key)
        $apiKey = 'YOUR_FIREBASE_WEB_API_KEY_HERE';

        // Firebase password reset endpoint
        $url = 'https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=' . $apiKey;

        $postData = [
            'requestType' => 'PASSWORD_RESET',
            'email'       => $email
        ];

        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => json_encode($postData),
            CURLOPT_HTTPHEADER     => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true,
        ]);

        $response = curl_exec($ch);
        $curlError = curl_error($ch);
        curl_close($ch);

        if ($curlError) {
            $msg = '❌ Error connecting to Firebase: ' . $curlError;
            $msgClass = 'error';
        } else {
            $data = json_decode($response, true);

            if (isset($data['error'])) {
                // Firebase returned an error (e.g., EMAIL_NOT_FOUND)
                $msg = '❌ Error: ' . $data['error']['message'];
                $msgClass = 'error';
            } else {
                // Success
                $msg = '✔ Reset link sent! Check your email.';
                $msgClass = 'success';
            }
        }
    }
}
?>