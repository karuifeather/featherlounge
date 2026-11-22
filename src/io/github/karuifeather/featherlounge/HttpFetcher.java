package io.github.karuifeather.featherlounge;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Iterator;

/** Blocking HTTP requests made natively, so the page can reach endpoints that send no CORS headers. */
class HttpFetcher {
    static final int STATUS_FAILED = -1;
    private static final int CONNECT_TIMEOUT_MS = 10000;
    private static final int READ_TIMEOUT_MS = 12000;

    static class Response {
        final int status;
        final String text;

        Response(int status, String text) {
            this.status = status;
            this.text = text;
        }
    }

    /** Never throws: a failure is reported as STATUS_FAILED with the error text as the body. */
    Response fetch(String method, String url, String headersJson, String body) {
        try {
            HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setRequestMethod(method);
            connection.setConnectTimeout(CONNECT_TIMEOUT_MS);
            connection.setReadTimeout(READ_TIMEOUT_MS);
            applyHeaders(connection, headersJson);
            if (body != null && body.length() > 0) writeBody(connection, body);
            int status = connection.getResponseCode();
            InputStream stream = status >= 400 ? connection.getErrorStream() : connection.getInputStream();
            return new Response(status, stream == null ? "" : readAll(stream));
        } catch (Exception e) {
            return new Response(STATUS_FAILED, String.valueOf(e));
        }
    }

    private static void applyHeaders(HttpURLConnection connection, String headersJson) throws JSONException {
        JSONObject headers = new JSONObject(headersJson);
        for (Iterator<String> keys = headers.keys(); keys.hasNext();) {
            String key = keys.next();
            connection.setRequestProperty(key, headers.getString(key));
        }
    }

    private static void writeBody(HttpURLConnection connection, String body) throws IOException {
        connection.setDoOutput(true);
        try (OutputStream out = connection.getOutputStream()) {
            out.write(body.getBytes("UTF-8"));
        }
    }

    private static String readAll(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[8192];
        int n;
        while ((n = in.read(buffer)) > 0) out.write(buffer, 0, n);
        return out.toString("UTF-8");
    }
}
