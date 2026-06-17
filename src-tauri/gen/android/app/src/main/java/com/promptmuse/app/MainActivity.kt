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
      fun saveImageToGallery(sourceFilePath: String, fileName: String): String {
          appContext?.let { context ->
              try {
                  val sourceFile = java.io.File(sourceFilePath)
                  if (!sourceFile.exists()) return "Source file not found"

                  if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) {
                      val contentValues = android.content.ContentValues().apply {
                          put(android.provider.MediaStore.MediaColumns.DISPLAY_NAME, fileName)
                          put(android.provider.MediaStore.MediaColumns.MIME_TYPE, "image/png")
                          put(android.provider.MediaStore.MediaColumns.RELATIVE_PATH, android.os.Environment.DIRECTORY_PICTURES + "/Eishougi")
                          put(android.provider.MediaStore.MediaColumns.IS_PENDING, 1)
                      }
                      val resolver = context.contentResolver
                      val collection = android.provider.MediaStore.Images.Media.getContentUri(android.provider.MediaStore.VOLUME_EXTERNAL_PRIMARY)
                      val uri = resolver.insert(collection, contentValues)
                      if (uri != null) {
                          resolver.openOutputStream(uri)?.use { outputStream ->
                              sourceFile.inputStream().use { inputStream ->
                                  inputStream.copyTo(outputStream)
                              }
                          }
                          contentValues.clear()
                          contentValues.put(android.provider.MediaStore.MediaColumns.IS_PENDING, 0)
                          resolver.update(uri, contentValues, null, null)
                          return "Pictures/Eishougi/" + fileName
                      } else {
                          throw Exception("MediaStore insert returned null. Possible permissions issue or file already exists.")
                      }
                  } else {
                      @Suppress("DEPRECATION")
                      val downloadDir = android.os.Environment.getExternalStoragePublicDirectory(android.os.Environment.DIRECTORY_PICTURES)
                      val targetDir = java.io.File(downloadDir, "Eishougi")
                      if (!targetDir.exists()) targetDir.mkdirs()
                      val targetFile = java.io.File(targetDir, fileName)
                      sourceFile.copyTo(targetFile, overwrite = true)
                      
                      android.media.MediaScannerConnection.scanFile(context, arrayOf(targetFile.absolutePath), arrayOf("image/png"), null)
                      return "Download/Eishougi/" + fileName
                  }
              } catch (e: Exception) {
                  e.printStackTrace()
                  return "Error: " + e.message
              }
          }
          return "Context is null"
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
    
    // Hide system bars for immersive fullscreen
    val windowInsetsController = WindowCompat.getInsetsController(window, window.decorView)
    windowInsetsController.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    windowInsetsController.hide(WindowInsetsCompat.Type.systemBars())
  }
}
