package com.promptmuse.app

import android.os.Bundle

import android.content.Context
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat

class MainActivity : TauriActivity() {
  companion object {
      var appContext: Context? = null
      
      @JvmStatic
      fun getContext(): Context? = appContext
      
      @JvmStatic
      external fun storeActivityInstance(activity: android.app.Activity)

      @JvmStatic
      fun startComfyService(title: String) {
          appContext?.let { ComfyForegroundService.startService(it, title) }
      }
      
      @JvmStatic
      fun updateComfyProgress(title: String, progress: Int) {
          appContext?.let { ComfyForegroundService.updateProgress(it, title, progress) }
      }
      
      @JvmStatic
      fun stopComfyService() {
          appContext?.let { ComfyForegroundService.stopService(it) }
      }
      
      @JvmStatic
      external fun initJvmContext()

      @JvmStatic
      fun saveImageToGallery(sourceFilePath: String, fileName: String, folder: String): String {
          appContext?.let { context ->
              try {
                  val sourceFile = java.io.File(sourceFilePath)
                  if (!sourceFile.exists()) return "Source file not found"

                  // Sanitize: folder must be a single path component (no slashes/traversal).
                  val safeFolder = folder.trim().trim('.').replace(Regex("[/\\\\:*?\"<>|]"), "_")
                                     .ifEmpty { "Eishougi" }

                  if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                      val contentValues = android.content.ContentValues().apply {
                          put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                          put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "image/png")
                          put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_PICTURES + "/" + safeFolder)
                          put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
                      }
                      val resolver = context.contentResolver
                      val collection = android.provider.MediaStore.Images.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY)
                       val uri = resolver.insert(collection, contentValues)
                       if (uri != null) {
                           try {
                             val outputStream = resolver.openOutputStream(uri)
                               ?: throw Exception("MediaStore output stream is unavailable")
                             outputStream.use { stream ->
                               sourceFile.inputStream().use { inputStream ->
                                   inputStream.copyTo(stream)
                               }
                             }
                             contentValues.clear()
                             contentValues.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0)
                             resolver.update(uri, contentValues, null, null)
                             return "Pictures/$safeFolder/" + fileName
                           } catch (writeError: Exception) {
                             resolver.delete(uri, null, null)
                             throw writeError
                           }
                      } else {
                          throw Exception("MediaStore insert returned null. Possible permissions issue or file already exists.")
                      }
                  } else {
                      @Suppress("DEPRECATION")
                      val downloadDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_PICTURES)
                      val targetDir = java.io.File(downloadDir, safeFolder)
                      if (!targetDir.exists()) targetDir.mkdirs()
                      val targetFile = java.io.File(targetDir, fileName)
                      sourceFile.copyTo(targetFile, overwrite = true)

                      android.media.MediaScannerConnection.scanFile(context, arrayOf(targetFile.absolutePath), arrayOf("image/png"), null)
                      return "Download/$safeFolder/" + fileName
                  }
              } catch (e: Exception) {
                  e.printStackTrace()
                  return "Error: " + e.message
              }
          }
          return "Context is null"
      }

      @JvmStatic
      fun installApk(filePath: String): String {
          appContext?.let { context ->
              try {
                  val file = java.io.File(filePath)
                  if (!file.exists()) return "Error: APK file not found at $filePath"

                  // Build a content:// URI via FileProvider (required since Android 7 for file:// intents).
                  val authority = context.packageName + ".fileprovider"
                  val uri = androidx.core.content.FileProvider.getUriForFile(context, authority, file)

                  val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
                      setDataAndType(uri, "application/vnd.android.package-archive")
                      addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
                      addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
                  }
                  context.startActivity(intent)
                  return "ok"
              } catch (e: Exception) {
                  e.printStackTrace()
                  return "Error: " + e.message
              }
          }
          return "Error: Context is null"
      }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    appContext = this
    super.onCreate(savedInstanceState)
    
    try {
        initJvmContext()
    } catch (e: Exception) {
        e.printStackTrace()
    }
    try {
        storeActivityInstance(this)
    } catch (e: Exception) {
        e.printStackTrace()
    }
    
    // Hide system bars for immersive fullscreen
    val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
    windowInsetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
  }
}
